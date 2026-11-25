# Gujarat Reference Data — Sources and Limitations

Checked for the initial pilot module on 25 November 2026.

## Ahmedabad airport

The Airports Authority of India eAIP chart for Ahmedabad (VAAH) identifies Sardar Vallabhbhai Patel International Airport and labels a Cargo Terminal Building T3. The aerodrome reference point published in the AIP chart is 23°04'16.301"N, 072°37'35.179"E.

Source: [AAI eAIP — Ahmedabad, VAAH](https://aim-india.aai.aero/eaip/eaip-v2-04-2026/eAIP/VAAH-PDC-APN-I.pdf)

The optional seed records the airport reference point and the cargo-terminal label. It does not assert live airline schedules, cargo capacity, booking access, or integration with the airport cargo-management system. Those require a separate authorised source or operational agreement.

## Sabarmati NW-87

IWAI feasibility/DPR material describes National Waterway 87 as a 212 km Sabarmati stretch from a barrage near Sadoliya to its confluence with the Gulf of Khambhat near Khambhat. This is useful as a waterway registry reference, but it does not prove that the Gandhinagar–Ahmedabad section currently has a continuous commercial navigation service, active cargo terminals, available vessels, or scheduled freight operations.

Source: [IWAI — Sabarmati NW-87 feasibility study](https://iwai.nic.in/sites/default/files/1814791015NW-87%20Sabarmati%20Final%20FSR_0.pdf)

The optional seed therefore records NW-87 as a designated national-waterway reference with:
- `operational_status = STUDY_REFERENCE_ONLY`
- `data_status = UNVERIFIED`
- no route geometry, terminal, vessel, or schedule pre-populated.

Do not change these fields to VERIFIED or operational without current, authoritative evidence for the exact stretch and operating conditions.

## Additional Gujarat national waterways

IWAI material also lists Gujarat waterways including Mahi (NW-66), Narmada (NW-73), and Tapi (NW-100), and identifies NW-48 as the Jawai–Luni–Rann of Kutch waterway. Their inclusion in a national-waterway list is not a substitute for segment-level navigability, terminal, draft, seasonal, and operator verification.

## Seed script

After applying `DB/migration_005_gujarat_module.sql`, optionally apply:

`DB/seed_gujarat_reference_data.sql`

The seed is idempotent for the airport IATA code and waterway code. It creates no synthetic schedules, capacity, or cargo bookings.
