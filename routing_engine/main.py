"""
Routing engine -- CLI entry point.

Usage:
    python main.py --list                 List all segments with IDs (to pick start/end)
    python main.py --from 1 --to 5        Compare fastest vs safest route between two segments

The comparison is the actual "AI-based alternate route suggestion"
feature: it shows the fastest route, the safest (risk-adjusted) route,
the delay difference between them, and flags any high-risk segments
along the way -- so a dispatcher can make an informed call instead of
just getting turn-by-turn directions.
"""
import argparse
import db
import graph_builder
import router


def load_graph():
    conn = db.get_connection()
    try:
        segments_with_risk = db.fetch_segments_with_risk(conn)
        segment_details = db.fetch_segment_details(conn)
        connections = db.fetch_connections(conn)
    finally:
        conn.close()
    return graph_builder.build_graph(segments_with_risk, segment_details, connections)


def list_segments(G):
    print(f"\n{'ID':<4} {'Risk':<9} {'Score':<7} {'Travel(min)':<12} Name")
    print("-" * 80)
    for seg_id, data in sorted(G.nodes(data=True)):
        print(f"{seg_id:<4} {data['risk_level']:<9} {data['risk_score']:<7} {data['normal_travel_min']:<12} {data['name']}")
    print()


def print_route(label, summary, total_time):
    if summary is None:
        print(f"\n{label}: NO ROUTE AVAILABLE (all paths blocked or severe-risk)")
        return
    print(f"\n{label} -- estimated {total_time:.0f} min")
    for seg in summary["segments"]:
        flag = f"  ⚠ {seg['risk_level'].upper()}" if seg["risk_level"] in ("high", "severe") else ""
        print(f"   -> {seg['name']:50} ({seg['travel_min']} min, risk {seg['risk_score']}){flag}")
    if summary["warnings"]:
        print("   Warnings:")
        for w in summary["warnings"]:
            print(f"     - {w}")


def compare_routes(G, start_id, end_id):
    fastest_path, fastest_time = router.find_route(G, start_id, end_id, mode="fastest")
    safest_path, safest_time = router.find_route(G, start_id, end_id, mode="safest")

    fastest_summary = router.summarize_route(G, fastest_path, mode="fastest")
    safest_summary = router.summarize_route(G, safest_path, mode="safest")

    print_route("FASTEST ROUTE", fastest_summary, fastest_time or 0)
    print_route("SAFEST ROUTE", safest_summary, safest_time or 0)

    if fastest_path and safest_path:
        if fastest_path == safest_path:
            print("\nFastest and safest routes are the same -- no risk tradeoff on this corridor.")
        else:
            delay = (safest_time or 0) - (fastest_time or 0)
            print(f"\nTaking the safest route costs an estimated {delay:.0f} extra minutes, "
                  f"but avoids: {', '.join(fastest_summary['warnings']) or 'flagged segments'}")

    # Show alternates (mainly useful once the graph has more real
    # interconnected roads -- a single linear corridor has only one path)
    alternates = router.find_alternate_routes(G, start_id, end_id, mode="safest")
    if len(alternates) > 1:
        print(f"\n{len(alternates)} alternate route(s) found:")
        for i, (path, total) in enumerate(alternates, 1):
            names = " -> ".join(G.nodes[s]["name"] for s in path)
            print(f"  {i}. ({total:.0f} min) {names}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NER Logistics routing engine")
    parser.add_argument("--list", action="store_true", help="List all segments with IDs")
    parser.add_argument("--from", dest="start", type=int, help="Start segment ID")
    parser.add_argument("--to", dest="end", type=int, help="End segment ID")
    args = parser.parse_args()

    G = load_graph()

    if args.list or not (args.start and args.end):
        list_segments(G)
        if not (args.start and args.end):
            print("Run again with --from <id> --to <id> to compare routes, e.g.:")
            print("  python main.py --from 1 --to 5\n")
    else:
        compare_routes(G, args.start, args.end)
