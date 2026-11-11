/* Runtime configuration. Everything the app needs to talk to the outside
   world lives here so it can be swapped per environment without a rebuild. */
window.APP_CONFIG = {
  /* Claims API. Leave apiBase empty to run the flow against mock data. */
  apiBase: '',
  endpoints: {
    policy: '/fnol/policy',   // GET  ?policy=<id>&token=<token>
    claims: '/fnol/claims'    // POST multipart: payload + photos[]
  },

  /* Agent-platform async callback. The H5 POSTs the claim + location directly to
     the platform with ?token=<dynamic token from the SMS link>. The platform
     allows this origin via CORS. */
  asyncCallbackUrl: 'https://agents.dyna.ai/api/async/callback',

  /* false: send photo metadata only. true: also embed each compressed photo
     as a base64 data URL. Keep false unless the workflow needs the images —
     three photos make a large request body. */
  callbackIncludePhotos: false,

  region: 'US',
  language: 'en',
  /* Whole-state view, roughly the geographic centre of California. */
  defaultCenter: { lat: 37.166, lng: -119.75 },
  defaultZoom: 1,

  /* Demo location. When set, tapping Allow on the location sheet drops the pin
     here instead of asking the device for GPS, and opens at street level.
     Set to null to use the real device location. */
  simulateLocation: {
    lat: 34.098,
    lng: -118.3387,
    line1: 'Sunset Blvd & N Highland Ave',
    short: 'Los Angeles, CA 90028',
    address: 'Sunset Blvd & N Highland Ave, Los Angeles, CA 90028'
  },
  streetZoom: 2200,

  /* Street-level detail, drawn only once the map is zoomed in this far. */
  streetMap: {
    src: 'assets/hollywood-streets.svg',
    bounds: { north: 34.1085, south: 34.0895, east: -118.3275, west: -118.3495 },
    minK: 40,
    labelMinK: 1100
  },

  demoPolicy: {
    policyNumber: 'CA-4471-8829',
    insured: {
      name: 'Daniel Reyes',
      phone: '+1 (650) 555-0142',
      email: 'daniel.reyes@example.com'
    },
    vehicle: {
      vin: '4T1B11HK5KU123456',
      year: 2019,
      make: 'Toyota',
      model: 'Camry LE',
      color: 'Silver',
      plate: '8KDL294',
      state: 'California',
      stateCode: 'CA'
    }
  }
};