import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

let configured = false
let mapsLibraryPromise: Promise<google.maps.MapsLibrary> | undefined
let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | undefined

function configureGoogleMaps() {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key) throw new Error('Google Maps API key is not configured.')
  if (!configured) {
    setOptions({ key, v: 'weekly', authReferrerPolicy: 'origin' })
    configured = true
  }
}

export function loadMapsLibrary() {
  configureGoogleMaps()
  if (!mapsLibraryPromise) mapsLibraryPromise = importLibrary('maps')
  return mapsLibraryPromise
}

export function loadPlacesLibrary() {
  configureGoogleMaps()
  if (!placesLibraryPromise) placesLibraryPromise = importLibrary('places')
  return placesLibraryPromise
}
