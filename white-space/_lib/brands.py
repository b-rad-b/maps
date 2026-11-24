"""Brand recipes for the white-space scan. One dict per study.

own / comp: functions that take the Overture places frame (name, lname, tax, basic_category, lon, lat, h3)
and return a boolean mask (lname = lower-case name, lbrand = lower-case Overture brand). demand: weights over metrics (suffix _r = summed within the trade radius,
no suffix = in the hex itself). white: rule for the white-space class among hexes with no own store.
"""
import re

MI = 1609.344
JUNK = r"support office|closed|coming soon|floral|warehouse|careers|bakery|counter|headquarters|wine|mini bags|zeek bar"

RECOVERY_NAME = r"cryo|cold plunge|plunge|red light|infrared|sauna|float|recovery|recover\b|hyperbaric|iv drip|iv lounge|iv therapy|hydration|contrast therap|biohack|longevity"
RECOVERY_EXCLUDE = r"addict|detox|rehab|sober|treatment|behavioral|mental|trauma|eating|wound|towing|outpatient|chiropract|physical therapy|dental|pediatric|recovery (?:center|centers|services|village)"

BRANDS = {
    "sprouts": dict(
        title="Where could the next Sprouts go?",
        short="Sprouts white space",
        brand="Sprouts Farmers Market",
        concept="natural and specialty grocery",
        radius_mi=3,
        own=lambda p: (p.lbrand.str.contains("sprouts farmers market") | p.lname.str.match(r"sprouts farmers market")) & ~p.lname.str.contains(JUNK),
        comp=lambda p: (p.lbrand.str.match(r"whole foods market|trader joe's|natural grocers") | p.lname.str.match(r"whole foods market|trader joe's|natural grocers")) & ~p.lname.str.contains(JUNK),
        comp_label="Whole Foods, Trader Joe's and Natural Grocers", comp_dedupe_m=250,
        comp_short="natural grocers",
        demand={"hh100_r": 0.30, "inc_share": 0.20, "ba_share": 0.20, "pop_r": 0.15, "road_km": 0.15},
        demand_text="households earning $100K+ within 3 mi (30%), the share of households earning $100K+ (20%), the share of adults with a bachelor's degree (20%), people within 3 mi (15%), arterial road in the hex (15%)",
        w_comp=0.30, w_own=1.0,
        min_market=("pop_r", 40000), min_text="40,000+ people within 3 miles",
        white=lambda d: d.comp_r <= 1, white_text="no Sprouts and at most one other natural grocer within 3 miles",
        contested_text="no Sprouts, but two or more other natural grocers within 3 miles",
        counties=None, area_text="Arizona, Nevada, New Mexico and Southern California",
        fields=[("People within 3 mi", "pop_r", 100), ("Households $100K+ within 3 mi", "hh100_r", 100), ("Share of households $100K+", "inc_pct", 1), ("Adults with a bachelor's degree", "ba_pct", 1)],
        home=dict(longitude=-113.6, latitude=34.2, zoom=5.4), spacing_km=10,
    ),
    "the-joint": dict(
        title="Where is there room for another walk-in chiropractic clinic?",
        short="The Joint white space",
        brand="The Joint Chiropractic",
        concept="walk-in, membership chiropractic",
        radius_mi=3,
        own=lambda p: p.lbrand.eq("the joint chiropractic") | (p.lname.str.match(r"the joint( chiropractic|\s*\.\.\.|$)") & (p.tax.eq("chiropractic") | p.basic_category.eq("complementary_and_alternative_medicine"))),
        comp=lambda p: p.tax.eq("chiropractic") | (p.lname.str.contains("chiropract") & p.basic_category.isin(["complementary_and_alternative_medicine", "health_care"])),
        comp_label="independent and chain chiropractors",
        comp_short="other chiropractors",
        demand={"a2564_r": 0.45, "places": 0.25, "hh100_r": 0.15, "road_km": 0.15},
        demand_text="adults aged 25 to 64 within 3 mi (45%), shops and services in the hex as a sign of a strip-center location (25%), households earning $100K+ within 3 mi (15%), arterial road in the hex (15%)",
        w_comp=0.03, w_own=1.0,
        min_market=("a2564_r", 25000), min_text="25,000+ adults aged 25 to 64 within 3 miles",
        white=lambda d: d.comp_r / (d.a2564_r / 10000) <= 2.0, white_text="no clinic of The Joint within 3 miles, and at most 2 other chiropractors per 10,000 working-age adults",
        contested_text="no clinic of The Joint within 3 miles, but more than 2 other chiropractors per 10,000 working-age adults",
        counties=None, area_text="Arizona, Nevada, New Mexico and Southern California",
        fields=[("Adults 25–64 within 3 mi", "a2564_r", 100), ("Households $100K+ within 3 mi", "hh100_r", 100), ("Places in hex", "places", 1)],
        home=dict(longitude=-113.6, latitude=34.2, zoom=5.4), spacing_km=10,
    ),
    "optimyze": dict(
        title="Where should the next recovery studio go in metro Phoenix?",
        short="Optimyze white space",
        brand="Optimyze",
        concept="recovery and longevity studio (sauna, cold plunge, red light, compression)",
        radius_mi=3,
        own=lambda p: p.lname.str.match(r"optimyze"),
        comp=lambda p: (p.tax.isin(["cryotherapy", "iv_hydration", "health_spa", "health_and_wellness_club", "sauna", "float_spa"])
                        | (p.lname.str.contains(RECOVERY_NAME) & p.basic_category.isin(["wellness_service", "health_care", "sports_and_recreation", "lifestyle_services"])))
                       & ~p.lname.str.contains(RECOVERY_EXCLUDE) & ~p.lname.str.match(r"optimyze"),
        comp_label="cryotherapy, sauna, float, IV and recovery studios",
        comp_short="recovery studios",
        demand={"ba_r": 0.25, "ba_share": 0.15, "hh150_r": 0.25, "a2564_r": 0.20, "road_km": 0.15},
        demand_text="adults with a bachelor's degree within 3 mi (25%) and their share of all adults (15%), households earning $150K+ within 3 mi (25%), adults aged 25 to 64 within 3 mi (20%), arterial road in the hex (15%)",
        w_comp=0.15, w_own=1.0,
        min_market=("a2564_r", 20000), min_text="20,000+ adults aged 25 to 64 within 3 miles",
        white=lambda d: d.comp_r <= 2, white_text="no Optimyze and at most two other recovery studios within 3 miles (about a 10-minute drive)",
        contested_text="no Optimyze, but three or more other recovery studios within 3 miles",
        counties=["04013", "04021"], area_text="Maricopa and Pinal counties, Arizona",
        fields=[("Adults 25–64 within 3 mi", "a2564_r", 100), ("Households $150K+ within 3 mi", "hh150_r", 100), ("Adults with a bachelor's degree", "ba_pct", 1)],
        home=dict(longitude=-111.95, latitude=33.47, zoom=9.2), spacing_km=6,
    ),
}
