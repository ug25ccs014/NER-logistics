import RouteAndRide from '../features/RouteAndRide.jsx';
import FieldReports from '../features/FieldReports.jsx';
import LiveLocationSos from '../features/LiveLocationSos.jsx';
import Inbox from '../features/Inbox.jsx';
import ShipmentBoard from '../features/ShipmentBoard.jsx';
import NearbyAccommodations from '../features/NearbyAccommodations.jsx';
import AlertsList from '../features/AlertsList.jsx';
import NetworkOverview from '../features/authority/NetworkOverview.jsx';
import ReviewQueue from '../features/authority/ReviewQueue.jsx';
import AlertManagement from '../features/authority/AlertManagement.jsx';
import TripsOversight from '../features/authority/TripsOversight.jsx';
import LiveDashcamAI from '../features/LiveDashcamAI.jsx';
import RoadIdentity from '../features/RoadIdentity.jsx';

// Single source of truth for "what tools does this role see on the
// Home screen, and does opening that tool need the map".
// needsMap: true  -> Workspace renders a sidebar panel + <MapView/>
// needsMap: false -> Workspace renders the panel full-width, no map
// (this is what keeps the map off the front page and out of tools
// that never touch it, instead of it always sitting there oversized).
//
// label/description are stored as translation KEYS (labelKey/descKey)
// rather than literal English text -- see translateTools() below,
// which resolves them through LanguageContext's t() so the Home
// screen tool grid is multilingual. The actual English/Hindi/Assamese
// strings live in context/LanguageContext.jsx's UI_STRINGS, keyed
// under "tool_*" -- that's the one place to edit the wording.
export const TOOLS_BY_ROLE = {
  driver: [
    {
      id: 'ai-dashcam',
      labelKey: 'tool_ai_dashcam_label',
      descKey: 'tool_ai_dashcam_desc',
      icon: 'alert',
      needsMap: false,
      Component: LiveDashcamAI,
    },
    {
      id: 'route',
      labelKey: 'tool_route_label',
      descKey: 'tool_route_desc',
      icon: 'route',
      needsMap: true,
      Component: RouteAndRide,
    },
    {
      id: 'field-reports',
      labelKey: 'tool_field_reports_label',
      descKey: 'tool_field_reports_desc',
      icon: 'report',
      needsMap: true,
      Component: FieldReports,
    },
    {
      id: 'sos',
      labelKey: 'tool_sos_label',
      descKey: 'tool_sos_desc',
      icon: 'sos',
      needsMap: true,
      Component: LiveLocationSos,
    },
    {
      id: 'stays',
      labelKey: 'tool_stays_label',
      descKey: 'tool_stays_desc_driver',
      icon: 'bed',
      needsMap: true,
      Component: NearbyAccommodations,
    },
    {
      id: 'shipments',
      labelKey: 'tool_shipments_label',
      descKey: 'tool_shipments_desc_driver',
      icon: 'box',
      needsMap: true,
      Component: ShipmentBoard,
    },
    {
      id: 'inbox',
      labelKey: 'tool_inbox_label',
      descKey: 'tool_inbox_desc_driver',
      icon: 'chat',
      needsMap: false,
      Component: Inbox,
    },
    {
      id: 'road-identity',
      labelKey: 'road_identity',
      descKey: 'road_identity_help',
      icon: 'route',
      needsMap: true,
      Component: RoadIdentity,
    },
    {
      id: 'alerts',
      labelKey: 'tool_alerts_label',
      descKey: 'tool_alerts_desc',
      icon: 'alert',
      needsMap: false,
      Component: AlertsList,
    },
  ],

  field_reporter: [
    {
      id: 'ai-dashcam',
      labelKey: 'tool_ai_dashcam_label',
      descKey: 'tool_ai_dashcam_desc',
      icon: 'alert',
      needsMap: false,
      Component: LiveDashcamAI,
    },
    {
      id: 'field-reports',
      labelKey: 'tool_field_reports_label',
      descKey: 'tool_field_reports_desc',
      icon: 'report',
      needsMap: true,
      Component: FieldReports,
    },
    {
      id: 'sos',
      labelKey: 'tool_sos_label',
      descKey: 'tool_sos_desc',
      icon: 'sos',
      needsMap: true,
      Component: LiveLocationSos,
    },
    {
      id: 'stays',
      labelKey: 'tool_stays_label',
      descKey: 'tool_stays_desc_reporter',
      icon: 'bed',
      needsMap: true,
      Component: NearbyAccommodations,
    },
    {
      id: 'inbox',
      labelKey: 'tool_inbox_label',
      descKey: 'tool_inbox_desc_reporter',
      icon: 'chat',
      needsMap: false,
      Component: Inbox,
    },
    {
      id: 'road-identity',
      labelKey: 'road_identity',
      descKey: 'road_identity_help',
      icon: 'route',
      needsMap: true,
      Component: RoadIdentity,
    },
    {
      id: 'alerts',
      labelKey: 'tool_alerts_label',
      descKey: 'tool_alerts_desc',
      icon: 'alert',
      needsMap: false,
      Component: AlertsList,
    },
  ],

  authority: [
    {
      id: 'network',
      labelKey: 'tool_network_label',
      descKey: 'tool_network_desc',
      icon: 'network',
      needsMap: true,
      Component: NetworkOverview,
    },
    {
      id: 'review',
      labelKey: 'tool_review_label',
      descKey: 'tool_review_desc',
      icon: 'report',
      needsMap: false,
      Component: ReviewQueue,
    },
    {
      id: 'manage-alerts',
      labelKey: 'tool_manage_alerts_label',
      descKey: 'tool_manage_alerts_desc',
      icon: 'alert',
      needsMap: false,
      Component: AlertManagement,
    },
    {
      id: 'trips',
      labelKey: 'tool_trips_label',
      descKey: 'tool_trips_desc',
      icon: 'truck',
      needsMap: false,
      Component: TripsOversight,
    },
    {
      id: 'road-identity',
      labelKey: 'road_identity',
      descKey: 'road_identity_help',
      icon: 'route',
      needsMap: true,
      Component: RoadIdentity,
    },
    {
      id: 'inbox',
      labelKey: 'tool_inbox_label',
      descKey: 'tool_inbox_desc_authority',
      icon: 'chat',
      needsMap: false,
      Component: Inbox,
    },
  ],
};

// Resolves labelKey/descKey through LanguageContext's t() into the
// label/description shape ToolCard.jsx and TopBar.jsx already expect
// -- so those components don't need to know translation happened.
export function translateTools(tools, t) {
  return tools.map((tool) => {
    let label = tool.label;
    let description = tool.description;
    if (typeof t === 'function') {
      try {
        if (tool.labelKey) {
          const value = t(tool.labelKey);
          if (value && value !== tool.labelKey) label = value;
        }
        if (tool.descKey) {
          const value = t(tool.descKey);
          if (value && value !== tool.descKey) description = value;
        }
      } catch {}
    }
    return { ...tool, label, description };
  });
}
