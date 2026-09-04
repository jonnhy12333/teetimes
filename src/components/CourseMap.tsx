import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { Drawer } from '@ark-ui/solid/drawer'
import { Popover } from '@ark-ui/solid/popover'
import { Tooltip } from '@ark-ui/solid/tooltip'
import { Portal } from 'solid-js/web'
import type { AvailabilityTrend, Course, TeeTime } from './Dashboard'
import CourseHours from './CourseHours'
import CourseAvatar from './CourseAvatar'
import { loadMapsLibrary } from '../googleMaps'

type HoleFilter = 'any' | 9 | 18
interface CourseMapProps {
  selectedDate: string
  courses: Course[]
  timesByCourse: Record<string, TeeTime[]>
  trendsByCourse: Record<string, AvailabilityTrend>
  selectedHoles: HoleFilter
  loadingCourseIds: string[]
  failedCourseIds: string[]
  userLocation: { latitude: number; longitude: number } | null
  theme: () => 'light' | 'dark'
  onSelectCourse: (course: Course) => void
  onSelectTeeTime: (course: Course, tee: TeeTime, price: number | undefined, holes: number | string) => void
}

const darkMapStyles: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1d2a2a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d2a2a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a8b8b0' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d4ddd7' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9fb5a8' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#203c31' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#7fa58c' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#344340' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#182421' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#b3c0bb' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#53635d' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#17231f' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#e0e8e3' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2a3835' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#142d38' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7796a0' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#142d38' }] }
]

const MOBILE_SHEET_SNAP_POINTS = ['500px', 1]

const hiddenPoiStyles: google.maps.MapTypeStyle[] = [
  { featureType: 'poi.business', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.sports_complex', elementType: 'labels', stylers: [{ visibility: 'off' }] }
]

const mapStyles = (theme: 'light' | 'dark') => theme === 'dark'
  ? [...darkMapStyles, ...hiddenPoiStyles]
  : hiddenPoiStyles

function selectedMarkerIcon(fillColor: string, horizontalOffset = 0): google.maps.Icon {
  const centerX = 26
  const markerY = 44
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="72" viewBox="0 0 56 72"><defs><filter id="s" x="-40%" y="-30%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".3"/></filter></defs><g filter="url(#s)"><path d="M${centerX} 9v18" stroke="#b3261e" stroke-width="3" stroke-linecap="round"/><path d="M${centerX + 2} 10 ${centerX + 18} 16 ${centerX + 2} 22Z" fill="#e53935" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="${centerX}" cy="${markerY}" r="19" fill="${fillColor}" stroke="#fff" stroke-width="4"/></g></svg>`
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(56, 72),
    anchor: new google.maps.Point(centerX - horizontalOffset, markerY),
    labelOrigin: new google.maps.Point(centerX, markerY)
  }
}

function offsetMarkerIcon(fillColor: string, horizontalOffset: number): google.maps.Icon {
  const centerX = 19
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38"><circle cx="${centerX}" cy="19" r="17" fill="${fillColor}" stroke="#fff" stroke-width="3"/></svg>`
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(38, 38),
    anchor: new google.maps.Point(centerX - horizontalOffset, 19),
    labelOrigin: new google.maps.Point(centerX, 19),
  }
}

function mapDistanceMiles(origin: { latitude: number; longitude: number }, course: Course) {
  if (course.latitude === undefined || course.longitude === undefined) return Number.POSITIVE_INFINITY
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(course.latitude - origin.latitude)
  const longitudeDelta = radians(course.longitude - origin.longitude)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(course.latitude)) * Math.sin(longitudeDelta / 2) ** 2
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function radarTileUrl(coord: google.maps.Point, zoom: number) {
  const tileCount = 2 ** zoom
  const x = ((coord.x % tileCount) + tileCount) % tileCount
  if (coord.y < 0 || coord.y >= tileCount) return ''
  const worldExtent = 20037508.342789244
  const tileSpan = worldExtent * 2 / tileCount
  const xmin = -worldExtent + x * tileSpan
  const xmax = xmin + tileSpan
  const ymax = worldExtent - coord.y * tileSpan
  const ymin = ymax - tileSpan
  const params = new URLSearchParams({
    bbox: `${xmin},${ymin},${xmax},${ymax}`,
    bboxSR: '3857',
    imageSR: '3857',
    size: '256,256',
    format: 'png32',
    interpolation: 'RSP_CubicConvolution',
    f: 'image',
  })
  return `https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer/exportImage?${params}`
}

function timeHourLabel(time: string) {
  const match = time.trim().match(/^(\d{1,2}):\d{2}\s*(AM|PM)$/i)
  return match ? `${Number(match[1])} ${match[2].toUpperCase()}` : time
}

function TrendIndicator(props: { trend: AvailabilityTrend }) {
  return <Tooltip.Root openDelay={200} closeDelay={100} positioning={{ placement: 'bottom-start', gutter: 6 }}>
    <Tooltip.Trigger class={`course-map-trend availability-trend-${props.trend.state}`} aria-label={`${props.trend.label}. ${props.trend.explanation}`}><i aria-hidden="true" />{props.trend.label}</Tooltip.Trigger>
    <Portal><Tooltip.Positioner><Tooltip.Content class="course-map-trend-tooltip">{props.trend.explanation}</Tooltip.Content></Tooltip.Positioner></Portal>
  </Tooltip.Root>
}

export default function CourseMap(props: CourseMapProps) {
  const [mapReady, setMapReady] = createSignal(false)
  const [mapError, setMapError] = createSignal('')
  const [mapsLibrary, setMapsLibrary] = createSignal<google.maps.MapsLibrary | null>(null)
  const [selectedCourseId, setSelectedCourseId] = createSignal<string | null>(null)
  const [mapFullscreen, setMapFullscreen] = createSignal(false)
  const [radarEnabled, setRadarEnabled] = createSignal(false)
  const [mobileLayout, setMobileLayout] = createSignal(false)
  const [mobileSnapPoint, setMobileSnapPoint] = createSignal<number | string>('500px')
  const [drawerOpen, setDrawerOpen] = createSignal(false)
  const [desktopPopoverOpen, setDesktopPopoverOpen] = createSignal(false)
  let container!: HTMLDivElement
  let map: google.maps.Map | undefined
  let mapClickListener: google.maps.MapsEventListener | undefined
  const markers = new Map<string, google.maps.Marker>()
  let locationMarker: google.maps.Marker | undefined
  let radarOverlay: google.maps.ImageMapType | undefined
  let fittedCourseKey = ''

  const selectedCourse = createMemo(() => props.courses.find((course) => course.id === selectedCourseId()))
  const selectedTimes = createMemo(() => selectedCourse() ? props.timesByCourse[selectedCourse()!.id] || [] : [])
  const selectedTimeGroups = createMemo(() => {
    const groups = new Map<string, TeeTime[]>()
    selectedTimes().forEach((tee) => {
      const label = timeHourLabel(tee.time)
      groups.set(label, [...(groups.get(label) || []), tee])
    })
    return Array.from(groups, ([label, times]) => ({ label, times }))
  })
  const isToday = createMemo(() => props.selectedDate === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()))

  const chooseCourse = (course: Course) => {
    if ((course.bookingMode ?? 'live') !== 'live') {
      setDrawerOpen(false)
      setDesktopPopoverOpen(false)
      setSelectedCourseId(null)
      props.onSelectCourse(course)
      return
    }
    setMobileSnapPoint('500px')
    setSelectedCourseId(course.id)
    if (mobileLayout()) setDrawerOpen(true)
    else setDesktopPopoverOpen(true)
  }

  const closeCourse = () => {
    if (mobileLayout()) setDrawerOpen(false)
    else setDesktopPopoverOpen(false)
  }

  onMount(() => {
    let disposed = false
    const mobileQuery = window.matchMedia('(max-width: 700px)')
    const updateMobileLayout = () => setMobileLayout(mobileQuery.matches)
    updateMobileLayout()
    mobileQuery.addEventListener('change', updateMobileLayout)
    const closeFullscreen = (event: KeyboardEvent) => { if (event.key === 'Escape') setMapFullscreen(false) }
    document.addEventListener('keydown', closeFullscreen)
    void loadMapsLibrary().then((library) => {
      if (disposed) return
      setMapsLibrary(library)
    }).catch((error) => setMapError(error instanceof Error ? error.message : 'Google Maps could not be loaded.'))
    onCleanup(() => {
      disposed = true
      markers.forEach((marker) => marker.setMap(null))
      markers.clear()
      locationMarker?.setMap(null)
      locationMarker = undefined
      if (map && radarOverlay) {
        const radarIndex = map.overlayMapTypes.getArray().indexOf(radarOverlay)
        if (radarIndex >= 0) map.overlayMapTypes.removeAt(radarIndex)
      }
      radarOverlay = undefined
      mapClickListener?.remove()
      mapClickListener = undefined
      map = undefined
      mobileQuery.removeEventListener('change', updateMobileLayout)
      document.removeEventListener('keydown', closeFullscreen)
    })
  })

  createEffect(() => {
    const library = mapsLibrary()
    const theme = props.theme()
    if (!library) return
    if (!map) {
      map = new library.Map(container, {
        center: { lat: 42.9, lng: -71.35 },
        zoom: 9,
        renderingType: google.maps.RenderingType.RASTER,
        styles: mapStyles(theme),
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
        clickableIcons: false,
        gestureHandling: 'greedy'
      })
      mapClickListener = map.addListener('click', closeCourse)
      setMapReady(true)
      return
    }
    map.setOptions({ styles: mapStyles(theme), fullscreenControl: false })
  })

  createEffect(() => {
    mapFullscreen()
    if (!mapReady() || !map) return
    const center = map.getCenter()
    requestAnimationFrame(() => {
      if (!map) return
      google.maps.event.trigger(map, 'resize')
      if (center) map.setCenter(center)
    })
  })

  createEffect(() => {
    const enabled = radarEnabled() && isToday()
    const library = mapsLibrary()
    if (!mapReady() || !map || !library) return
    if (!radarOverlay) {
      radarOverlay = new library.ImageMapType({
        getTileUrl: radarTileUrl,
        maxZoom: 18,
        minZoom: 3,
        opacity: 0.62,
        tileSize: new google.maps.Size(256, 256),
      })
    }
    const radarIndex = map.overlayMapTypes.getArray().indexOf(radarOverlay)
    if (enabled && radarIndex < 0) map.overlayMapTypes.push(radarOverlay)
    if (!enabled && radarIndex >= 0) map.overlayMapTypes.removeAt(radarIndex)
  })

  createEffect(() => {
    if (isToday()) return
    setRadarEnabled(false)
  })

  createEffect(() => {
    if (!mapReady() || !map) return
    const courses = props.courses.filter((course) => course.latitude !== undefined && course.longitude !== undefined)
    const timesByCourse = props.timesByCourse
    const loadingIds = props.loadingCourseIds
    const failedIds = props.failedCourseIds
    const activeId = selectedCourseId()

    const visibleCourseIds = new Set(courses.map((course) => course.id))
    const coursesByPosition = new Map<string, Course[]>()
    courses.forEach((course) => {
      const key = `${course.latitude!.toFixed(6)},${course.longitude!.toFixed(6)}`
      coursesByPosition.set(key, [...(coursesByPosition.get(key) || []), course])
    })
    markers.forEach((marker, courseId) => {
      if (visibleCourseIds.has(courseId)) return
      marker.setMap(null)
      markers.delete(courseId)
    })
    courses.forEach((course) => {
      const count = (timesByCourse[course.id] || []).length
      const bookingOnly = (course.bookingMode ?? 'live') !== 'live'
      const failed = failedIds.includes(course.id)
      const selected = activeId === course.id
      const fillColor = bookingOnly ? '#2962a3' : failed ? '#c0392b' : count === 0 ? '#747c78' : '#4caf50'
      const positionKey = `${course.latitude!.toFixed(6)},${course.longitude!.toFixed(6)}`
      const positionGroup = coursesByPosition.get(positionKey) || [course]
      const horizontalOffset = positionGroup.length > 1 ? (positionGroup.findIndex((candidate) => candidate.id === course.id) - (positionGroup.length - 1) / 2) * 40 : 0
      let marker = markers.get(course.id)
      if (!marker) {
        marker = new google.maps.Marker({ map, position: { lat: course.latitude!, lng: course.longitude! } })
        marker.addListener('click', () => chooseCourse(course))
        markers.set(course.id, marker)
      }
      marker.setTitle(bookingOnly ? `${course.name}: ${course.bookingMode === 'phone' ? 'call to book' : 'book on course site'}` : `${course.name}: ${count} matching ${count === 1 ? 'tee time' : 'tee times'}`)
      marker.setLabel({ text: bookingOnly ? (course.bookingMode === 'phone' ? '☎' : '↗') : loadingIds.includes(course.id) ? '…' : failed ? '!' : String(count), color: '#fff', fontSize: bookingOnly ? '15px' : '12px', fontWeight: '800' })
      marker.setIcon(selected ? selectedMarkerIcon(fillColor, horizontalOffset) : horizontalOffset ? offsetMarkerIcon(fillColor, horizontalOffset) : {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor,
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeOpacity: 1,
        strokeWeight: 3,
        scale: 17
      })
      marker.setZIndex(selected ? 20 : count > 0 || bookingOnly ? 10 : 1)
    })

    const userLocation = props.userLocation
    const locationKey = userLocation ? `${userLocation.latitude.toFixed(3)},${userLocation.longitude.toFixed(3)}` : 'none'
    const courseKey = `${courses.map((course) => course.id).sort().join('|')}@${locationKey}`
    if (courses.length && courseKey !== fittedCourseKey) {
      fittedCourseKey = courseKey
      let coursesToFrame = courses
      let includeUserLocation = false
      if (courses.length > 1 && userLocation) {
        const nearbyCourses = courses.filter((course) => mapDistanceMiles(userLocation, course) <= 35)
        if (nearbyCourses.length) {
          coursesToFrame = nearbyCourses
          includeUserLocation = true
        }
      } else if (courses.length > 1) {
        const latitudes = courses.map((course) => course.latitude!).sort((a, b) => a - b)
        const longitudes = courses.map((course) => course.longitude!).sort((a, b) => a - b)
        const midpoint = Math.floor(courses.length / 2)
        const center = { latitude: latitudes[midpoint], longitude: longitudes[midpoint] }
        const clusteredCourses = courses.filter((course) => mapDistanceMiles(center, course) <= 40)
        if (clusteredCourses.length) coursesToFrame = clusteredCourses
      }
      const bounds = new google.maps.LatLngBounds()
      coursesToFrame.forEach((course) => bounds.extend({ lat: course.latitude!, lng: course.longitude! }))
      if (includeUserLocation && userLocation) bounds.extend({ lat: userLocation.latitude, lng: userLocation.longitude })
      map.fitBounds(bounds, 60)
      if (coursesToFrame.length === 1) map.setZoom(11)
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

  const panelContents = (course: Course, mobile: boolean) => <>
    <Show when={mobile} fallback={<Popover.Title class="sr-only">{course.name} tee times</Popover.Title>}>
      <Drawer.Title class="sr-only">{course.name} tee times</Drawer.Title>
      <Drawer.Grabber class="course-map-sheet-controls" aria-label="Resize course tee times">
        <Drawer.GrabberIndicator class="course-map-sheet-grabber" />
      </Drawer.Grabber>
    </Show>
    <header classList={{ 'has-image': Boolean(course.headerImageUrl) }} style={course.headerImageUrl ? { 'background-image': `linear-gradient(180deg, rgb(8 18 12 / 8%) 0%, rgb(8 18 12 / 82%) 100%), url("${course.headerImageUrl}")` } : undefined}>
      <button type="button" class="course-avatar-button" onClick={() => props.onSelectCourse(course)} aria-label={`View information about ${course.name}`}><CourseAvatar name={course.name} logoUrl={course.logoUrl} /></button>
      <div class="course-map-panel-identity"><button type="button" class="course-name course-name-button" onClick={() => props.onSelectCourse(course)}>{course.name}</button><div class="course-map-panel-meta"><p>{course.city}, {course.state}</p><CourseHours course={course} inline /></div><Show when={props.trendsByCourse[course.id]}>{(trend) => <TrendIndicator trend={trend()} />}</Show></div>
      <Show when={mobile} fallback={<Popover.CloseTrigger class="course-map-panel-close" aria-label="Close course tee times">×</Popover.CloseTrigger>}>
        <Drawer.CloseTrigger class="course-map-panel-close" aria-label="Close course tee times">×</Drawer.CloseTrigger>
      </Show>
    </header>
    <div class="course-map-panel-body" data-no-drag>
      <Show when={selectedTimes().length} fallback={<p class="course-map-no-times">No tee times match the selected filters.</p>}>
        <div class="course-map-agenda"><For each={selectedTimeGroups()}>{(group) => <section class="course-map-hour-group"><h3>{group.label}</h3><div class="course-map-time-list"><For each={group.times}>{(tee) => {
            const option = () => shownOption(tee)
            const price = () => option()?.price ?? tee.price
            return <button type="button" classList={{ 'availability-best': (tee.availableSpots || 0) >= 4, 'availability-low': tee.availableSpots === 1 }} onClick={() => props.onSelectTeeTime(course, tee, price(), shownHoles(tee))}><strong>{tee.time}</strong><span><Show when={price() !== undefined}>{String.fromCharCode(36)}{price()} · </Show>{shownHoles(tee)} holes · {tee.availableSpots ? `${tee.availableSpots} ${tee.availableSpots === 1 ? 'spot' : 'spots'}` : 'Spots vary'}</span></button>
          }}</For></div></section>}</For></div>
      </Show>
    </div>
  </>

  return <div class="course-map-board" classList={{ 'course-map-fullscreen': mapFullscreen() }}>
    <div class="course-map-canvas" ref={container} aria-label="Map of golf courses" />
    <Show when={isToday()}><button type="button" class="course-map-radar-toggle" classList={{ active: radarEnabled() }} onClick={() => setRadarEnabled(!radarEnabled())} aria-pressed={radarEnabled()} title="Toggle current Doppler radar"><span aria-hidden="true">◉</span> Current Radar</button></Show>
    <Show when={radarEnabled() && isToday()}><a class="course-map-radar-credit" href="https://radar.weather.gov/" target="_blank" rel="noreferrer">Current radar · NOAA/NWS</a></Show>
    <button type="button" class="course-map-fullscreen-toggle" onClick={() => setMapFullscreen(!mapFullscreen())} aria-label={mapFullscreen() ? 'Exit fullscreen map' : 'Open fullscreen map'} title={mapFullscreen() ? 'Exit fullscreen' : 'Fullscreen map'}><svg viewBox="0 0 24 24" aria-hidden="true"><Show when={mapFullscreen()} fallback={<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />}><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" /></Show></svg></button>
    <Show when={mapError()}>{(message) => <div class="course-map-empty">{message()}</div>}</Show>
    <Show when={props.courses.every((course) => course.latitude === undefined || course.longitude === undefined)}><div class="course-map-empty">No course locations are available.</div></Show>
    <Show when={selectedCourse()} keyed>{(course) => <Show when={!mobileLayout()}>
      <Popover.Root open={desktopPopoverOpen()} modal={false} portalled={false} autoFocus={false} onOpenChange={(details) => setDesktopPopoverOpen(details.open)} onExitComplete={() => setSelectedCourseId(null)}>
        <Popover.Positioner class="course-map-desktop-positioner"><Popover.Content class="course-map-panel course-map-popover">{panelContents(course, false)}</Popover.Content></Popover.Positioner>
      </Popover.Root>
    </Show>}</Show>
    <Show when={mobileLayout()}>
      <Portal>
        <Drawer.Root open={drawerOpen()} snapPoints={MOBILE_SHEET_SNAP_POINTS} snapPoint={mobileSnapPoint()} onSnapPointChange={(details) => { if (details.snapPoint !== null) setMobileSnapPoint(details.snapPoint) }} swipeDirection="down" onOpenChange={(details) => setDrawerOpen(details.open)} onExitComplete={() => setSelectedCourseId(null)}>
          <Drawer.Backdrop class="course-map-drawer-backdrop" />
          <Drawer.Positioner class="course-map-drawer-positioner">
            <Drawer.Content class="course-map-panel course-map-drawer">
              <Show when={selectedCourse()} keyed>{(course) => panelContents(course, true)}</Show>
            </Drawer.Content>
          </Drawer.Positioner>
        </Drawer.Root>
      </Portal>
    </Show>
  </div>
}
