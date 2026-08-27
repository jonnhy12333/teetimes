import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import type { Course, TeeTime } from './Dashboard'

type HoleFilter = 'any' | 9 | 18

interface CourseMapProps {
  courses: Course[]
  timesByCourse: Record<string, TeeTime[]>
  selectedHoles: HoleFilter
  loadingCourseIds: string[]
  failedCourseIds: string[]
  userLocation: { latitude: number; longitude: number } | null
  onSelectCourse: (course: Course) => void
  onSelectTeeTime: (course: Course, tee: TeeTime, price: number | undefined, holes: number | string) => void
}

let mapsLibraryPromise: Promise<google.maps.MapsLibrary> | undefined
function loadMapsLibrary() {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key) return Promise.reject(new Error('Google Maps API key is not configured.'))
  if (!mapsLibraryPromise) {
    setOptions({ key, v: 'weekly', authReferrerPolicy: 'origin' })
    mapsLibraryPromise = importLibrary('maps')
  }
  return mapsLibraryPromise
}

function selectedMarkerIcon(fillColor: string): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="64" viewBox="0 0 54 64"><defs><filter id="s" x="-40%" y="-30%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".3"/></filter></defs><g filter="url(#s)"><path d="M27 5v18" stroke="#27632d" stroke-width="3" stroke-linecap="round"/><path d="M29 6 45 12 29 18Z" fill="#4caf50" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="27" cy="40" r="19" fill="${fillColor}" stroke="#fff" stroke-width="4"/></g></svg>`
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(54, 64),
    anchor: new google.maps.Point(27, 40),
    labelOrigin: new google.maps.Point(27, 40)
  }
}

export default function CourseMap(props: CourseMapProps) {
  const [mapReady, setMapReady] = createSignal(false)
  const [mapError, setMapError] = createSignal('')
  const [selectedCourseId, setSelectedCourseId] = createSignal<string | null>(null)
  let container!: HTMLDivElement
  let map: google.maps.Map | undefined
  const markers = new Map<string, google.maps.Marker>()
  let locationMarker: google.maps.Marker | undefined
  let fittedCourseKey = ''

  const selectedCourse = createMemo(() => props.courses.find((course) => course.id === selectedCourseId()))
  const selectedTimes = createMemo(() => selectedCourse() ? props.timesByCourse[selectedCourse()!.id] || [] : [])

  const chooseCourse = (course: Course) => {
    setSelectedCourseId(course.id)
  }

  onMount(() => {
    let disposed = false
    void loadMapsLibrary().then(({ Map }) => {
      if (disposed) return
      map = new Map(container, {
        center: { lat: 42.9, lng: -71.35 },
        zoom: 9,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: 'greedy'
      })
      setMapReady(true)
    }).catch((error) => setMapError(error instanceof Error ? error.message : 'Google Maps could not be loaded.'))
    onCleanup(() => {
      disposed = true
      markers.forEach((marker) => marker.setMap(null))
      markers.clear()
      locationMarker?.setMap(null)
      locationMarker = undefined
      map = undefined
    })
  })

  createEffect(() => {
    if (!mapReady() || !map) return
    const courses = props.courses.filter((course) => course.latitude !== undefined && course.longitude !== undefined)
    const timesByCourse = props.timesByCourse
    const loadingIds = props.loadingCourseIds
    const failedIds = props.failedCourseIds
    const activeId = selectedCourseId()

    const visibleCourseIds = new Set(courses.map((course) => course.id))
    markers.forEach((marker, courseId) => {
      if (visibleCourseIds.has(courseId)) return
      marker.setMap(null)
      markers.delete(courseId)
    })
    courses.forEach((course) => {
      const count = (timesByCourse[course.id] || []).length
      const failed = failedIds.includes(course.id)
      const selected = activeId === course.id
      const fillColor = failed ? '#c0392b' : count === 0 ? '#747c78' : '#4caf50'
      let marker = markers.get(course.id)
      if (!marker) {
        marker = new google.maps.Marker({ map, position: { lat: course.latitude!, lng: course.longitude! } })
        marker.addListener('click', () => chooseCourse(course))
        markers.set(course.id, marker)
      }
      marker.setTitle(`${course.name}: ${count} matching ${count === 1 ? 'tee time' : 'tee times'}`)
      marker.setLabel({ text: loadingIds.includes(course.id) ? '…' : failed ? '!' : String(count), color: '#fff', fontSize: '12px', fontWeight: '800' })
      marker.setIcon(selected ? selectedMarkerIcon(fillColor) : {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor,
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeOpacity: 1,
        strokeWeight: 3,
        scale: 17
      })
      marker.setZIndex(selected ? 20 : count > 0 ? 10 : 1)
    })

    const courseKey = courses.map((course) => course.id).sort().join('|')
    if (courses.length && courseKey !== fittedCourseKey) {
      fittedCourseKey = courseKey
      const bounds = new google.maps.LatLngBounds()
      courses.forEach((course) => bounds.extend({ lat: course.latitude!, lng: course.longitude! }))
      map.fitBounds(bounds, 60)
      if (courses.length === 1) map.setZoom(11)
    }
  })

  createEffect(() => {
    const selected = selectedCourseId()
    if (selected && !props.courses.some((course) => course.id === selected)) setSelectedCourseId(null)
  })

  createEffect(() => {
    if (!mapReady() || !map) return
    const userLocation = props.userLocation
    if (!userLocation) {
      locationMarker?.setMap(null)
      locationMarker = undefined
      return
    }
    const position = { lat: userLocation.latitude, lng: userLocation.longitude }
    if (!locationMarker) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="#4285f4" fill-opacity=".2"/><circle cx="17" cy="17" r="8" fill="#4285f4" stroke="#fff" stroke-width="3"/></svg>'
      locationMarker = new google.maps.Marker({
        map,
        position,
        title: 'Your location',
        zIndex: 30,
        icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new google.maps.Size(34, 34), anchor: new google.maps.Point(17, 17) }
      })
    } else {
      locationMarker.setPosition(position)
      locationMarker.setMap(map)
    }
  })

  const shownOption = (tee: TeeTime) => props.selectedHoles === 'any' ? undefined : tee.options?.find((option) => option.holes === props.selectedHoles)
  const shownHoles = (tee: TeeTime) => props.selectedHoles === 'any' ? tee.holes : props.selectedHoles

  return <div class="course-map-board">
    <div class="course-map-canvas" ref={container} aria-label="Map of golf courses" />
    <Show when={mapError()}>{(message) => <div class="course-map-empty">{message()}</div>}</Show>
    <Show when={props.courses.every((course) => course.latitude === undefined || course.longitude === undefined)}><div class="course-map-empty">No course locations are available.</div></Show>
    <Show when={selectedCourse()} keyed>{(course) => {
      return <aside class="course-map-panel" aria-label={`${course.name} tee times`}>
        <header classList={{ 'has-image': Boolean(course.headerImageUrl) }} style={course.headerImageUrl ? { 'background-image': `linear-gradient(180deg, rgb(8 18 12 / 8%) 0%, rgb(8 18 12 / 82%) 100%), url("${course.headerImageUrl}")` } : undefined}>
          <button type="button" class="course-avatar course-avatar-button" onClick={() => props.onSelectCourse(course)} aria-label={`View information about ${course.name}`}><Show when={course.logoUrl} fallback={course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></button>
          <div><button type="button" class="course-name course-name-button" onClick={() => props.onSelectCourse(course)}>{course.name}</button><p>{course.city}, {course.state}</p></div>
          <button type="button" class="course-map-panel-close" onClick={() => setSelectedCourseId(null)} aria-label="Close course tee times">×</button>
        </header>
        <div class="course-map-panel-body">
          <strong>{selectedTimes().length} matching {selectedTimes().length === 1 ? 'time' : 'times'}</strong>
          <Show when={selectedTimes().length} fallback={<p class="course-map-no-times">No tee times match the selected filters.</p>}>
            <div class="course-map-time-list"><For each={selectedTimes()}>{(tee) => {
              const option = () => shownOption(tee)
              const price = () => option()?.price ?? tee.price
              return <button type="button" classList={{ 'availability-best': (tee.availableSpots || 0) >= 4, 'availability-low': tee.availableSpots === 1 }} onClick={() => props.onSelectTeeTime(course, tee, price(), shownHoles(tee))}><strong>{tee.time}</strong><span><Show when={price() !== undefined}>{String.fromCharCode(36)}{price()} · </Show>{shownHoles(tee)} holes · {tee.availableSpots ? `${tee.availableSpots} ${tee.availableSpots === 1 ? 'spot' : 'spots'}` : 'Spots vary'}</span></button>
            }}</For></div>
          </Show>
        </div>
      </aside>
    }}</Show>
  </div>
}
