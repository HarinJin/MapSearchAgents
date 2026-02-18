# MapSearchAgents

A map search system built on Claude's multi-agent architecture. A chain of specialized agents — translator, map-search strategist, API picker, and place enricher — work under a central orchestrator to turn natural language queries into rich, actionable map results.

## How It Works

```
"Good hangover soup spots on the way from Gangnam to Pangyo"
                            │
                ┌───────────▼───────────┐
                │   🎯  Orchestrator    │   Classifies query, routes to agents
                └───────────┬───────────┘
                            │
                ┌───────────▼───────────┐
                │   🔤  Translator      │   "hangover soup" → 해장국, 죽, 우동
                │                       │   Detects: route query + slang
                └───────────┬───────────┘
                            │
                ┌───────────▼───────────┐
                │   🗺️  MapSearch       │   Plans: segment route into zones,
                │                       │   search each zone for keywords
                └───────────┬───────────┘
                            │
                ┌───────────▼───────────┐
                │   ⚡  APIPicker       │   Executes: geocode → keyword search
                │                       │   Returns: normalized Place objects
                └───────────┬───────────┘
                            │
                ┌───────────▼───────────┐
                │   🕐  PlaceEnricher   │   Adds: opening hours, time warnings
                │      (if needed)      │   Filters by time conditions
                └───────────┬───────────┘
                            │
                    📍 Final Results
                  (with map links & context)
```

## Features

- **Natural Language Understanding** — Handles slang, colloquialisms, and contextual expressions (e.g., "hip cafes for working" → cozy cafes with wifi/outlets)
- **Dual Map Provider** — Kakao Local API for Korean domestic search, Google Places API for international locations
- **6 Search Scenarios** — Daily search, travel planning, family/kids, time-based, pet-friendly, activities & sports
- **Route-Based Search** — Finds places along a route between two points, segmented into search zones
- **Time-Aware Enrichment** — Checks opening hours, warns about closing times, filters by "open now"
- **Interactive Map Output** — Generates standalone HTML maps with Leaflet, 3-panel layouts, and real road routing via OSRM

## Architecture

### Agent Pipeline

| Agent | Model | Role |
|-------|-------|------|
| **Translator** | Sonnet | Interprets slang, context, and time expressions into searchable keywords |
| **MapSearch** | Sonnet | Designs the optimal search strategy (radius, route, or multi-point) |
| **APIPicker** | Haiku | Executes API calls and returns normalized place data |
| **PlaceEnricher** | Haiku | Adds opening hours and time-based filtering (triggered conditionally) |

### Query Classification

| Type | Example | Strategy |
|------|---------|----------|
| `simple` | "cafes near Gangnam Station" | Single-point radius search |
| `contextual` | "good places to chat over drinks" | Slang translation → keyword search |
| `route` | "on the way from Gangnam to Pangyo" | Route segmentation → zone search |
| `complex` | "comfort food on the way to Pangyo" | Route + slang (both agents) |

### Cross-Scenario Support

Queries can match multiple scenarios simultaneously:

| Scenario | Trigger Keywords | Data Focus |
|----------|-----------------|------------|
| A. Daily | nearby, restaurants, cafes | Core place info + tags |
| B. Travel | trip, N-day itinerary, overseas cities | Ratings + day grouping + trip roles |
| C. Family | kids, stroller, family-friendly | Accessibility tags |
| D. Time-based | now, open, midnight, 24hr | Opening hours + closing warnings |
| E. Pet-friendly | dog, pet, veterinary | Pet policy tags + disclaimers |
| F. Activities | hiking, climbing, camping, surfing | Activity type tags |

## Setup

### Prerequisites

- Node.js >= 18.0.0
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

### Installation

```bash
git clone https://github.com/HarinJin/MapSearchAgents.git
cd MapSearchAgents
npm install
```

### API Keys

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
```

```env
# Required for Korean domestic search
# Get from: https://developers.kakao.com → My Application → App Keys → REST API Key
KAKAO_REST_API_KEY=your_key_here

# Required for international search
# Get from: https://console.cloud.google.com → Enable "Places API"
GOOGLE_PLACES_API_KEY=your_key_here

# Search Settings
DEFAULT_SEARCH_RADIUS=2000
MAX_RESULTS=15
ROUTE_SEGMENT_DISTANCE=5000
```

## Usage

### With Claude Code

Open the project in Claude Code and ask naturally:

```
"Find cafes good for working near Gangnam Station"
"Ramen shops in Shibuya, Tokyo"
"Pet-friendly cafes in Seoul"
"What's open near Jamsil at midnight?"
"Family-friendly restaurants on the way from Gangnam to Pangyo"
```

The orchestrator automatically classifies your query, activates the right agents, and returns results with clickable map links.

### CLI Scripts (Direct)

```bash
# Keyword search (Kakao)
node scripts/kakao-search.js keyword "카페" --x=127.028 --y=37.498 --radius=1000

# Category search (Kakao)
node scripts/kakao-search.js category FD6 --x=127.028 --y=37.498

# Geocoding
node scripts/kakao-search.js geocode "강남역"

# Google Places search
node scripts/google-places.js find "ramen" --lat=35.6595 --lng=139.7004

# Check opening hours (Google)
node scripts/google-places.js check-open PLACE_ID

# Batch enrichment (Google)
node scripts/google-places.js enrich --places='[{"name":"...", "lat":..., "lng":...}]'
```

### Category Codes (Kakao)

| Code | Category |
|------|----------|
| FD6 | Restaurants |
| CE7 | Cafes |
| AT4 | Tourist Attractions |
| CT1 | Cultural Facilities |
| AD5 | Lodging |
| HP8 | Hospitals |

## Project Structure

```
MapSearchAgents/
├── .claude/
│   ├── agents/                  # Agent definitions
│   │   ├── translator.md       # Slang/context interpreter
│   │   ├── map-search.md       # Search strategy planner
│   │   ├── api-picker.md       # API executor
│   │   └── place-enricher.md   # Time-based enrichment
│   └── skills/
│       └── map-search/         # Skill config + reference docs
├── scripts/
│   ├── kakao-search.js         # Kakao Local API CLI
│   ├── google-places.js        # Google Places API CLI
│   ├── types/
│   │   ├── place.js            # Place data schema & normalization
│   │   └── enrichment.js       # Time condition types
│   └── utils/
│       ├── geocode.js          # Address ↔ coordinate conversion
│       ├── route-segment.js    # Route segmentation (Haversine)
│       └── review-filter.js    # Keyword-based filtering
├── data/
│   └── slang-dictionary.json   # Slang → keyword mapping
├── output/                     # Generated HTML maps
├── CLAUDE.md                   # Orchestrator instructions
├── .env.example                # Environment template
└── package.json
```

## Data Schema

Each place returned by the pipeline is normalized into a three-layer structure:

```
┌─────────────────────────────────────────┐
│  Layer 1: Core Provider Data            │
│  name, address, coordinates, category,  │
│  phone, mapUrl, distance, provider      │
├─────────────────────────────────────────┤
│  Layer 2: Enrichment (Google / Enricher)│
│  rating, reviewCount, openNow,          │
│  closingTime, closingWarning, photoUrl  │
├─────────────────────────────────────────┤
│  Layer 3: Agent Context                 │
│  tags[], suitability[], dayGroup,       │
│  tripRole, areaGroup, disclaimer        │
└─────────────────────────────────────────┘
```

Only non-null fields are included in the response.

## Map Visualization

The system can generate interactive HTML maps with:

- **3-Panel Layout** — Place list (left) + Map (center) + Trip planner (right)
- **Real Road Routing** — Actual driving routes via OSRM, not just straight lines
- **Marker Clustering** — Category-colored markers with click-to-detail popups
- **Drag & Drop Itinerary** — Build multi-day travel plans by dragging places
- **Route Optimization** — Nearest-neighbor algorithm for efficient ordering
- **localStorage Persistence** — Save and reload travel plans

## API Providers

| Provider | Coverage | Strengths | Limitations |
|----------|----------|-----------|-------------|
| **Kakao Local** | South Korea | Accurate Korean addresses, rich category system | No ratings, no hours, no reviews |
| **Google Places** | Worldwide | Ratings, reviews, hours, photos | Paid (with $200/mo free credit) |
| **OSRM** | Worldwide | Free road routing & distance | No traffic data |

## License

MIT
