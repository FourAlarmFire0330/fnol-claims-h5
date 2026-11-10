/* Runtime configuration. Everything the app needs to talk to the outside
   world lives here so it can be swapped per environment without a rebuild. */
window.APP_CONFIG = {
  /* Google Maps JavaScript API key.
     Enable: Maps JavaScript API, Places API (New), Geocoding API.
     Restrict the key to your H5 origin (HTTP referrers).
     Leave empty to preview the whole flow on the built-in demo map. */
  googleMapsApiKey: '',

  /* Claims API. Leave apiBase empty to run the flow against mock data. */
  apiBase: '',
  endpoints: {
    policy: '/fnol/policy',   // GET  ?policy=<id>&token=<token>
    claims: '/fnol/claims'    // POST multipart: payload + photos[]
  },

  /* Agent-platform async callback. Normally the SMS service puts the full
     callback URL (with ?token=) on the H5 link as ?callback=..., so this can
     stay empty. Set it here only for a fixed test/staging callback. */
  asyncCallbackUrl: '',

  /* false: send photo metadata only. true: also embed each compressed photo
     as a base64 data URL. Keep false unless the workflow needs the images —
     three photos make a large request body. */
  callbackIncludePhotos: false,

  region: 'US',
  language: 'en',
  defaultCenter: { lat: 37.4529, lng: -122.1817 },   // Menlo Park, CA
  defaultZoom: 17,

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