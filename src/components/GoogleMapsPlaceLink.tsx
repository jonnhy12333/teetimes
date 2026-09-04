import { createSignal, onMount } from 'solid-js'
import type { Course } from './Dashboard'
import { findGooglePlace } from './CourseHours'

function fallbackUrl(course: Course) {
  const query = `${course.name}, ${course.city}, ${course.state}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export default function GoogleMapsPlaceLink(props: { course: Course }) {
  const [href, setHref] = createSignal(fallbackUrl(props.course))
  onMount(() => {
    void findGooglePlace(props.course).then((place) => {
      if (place?.googleMapsURI) setHref(place.googleMapsURI)
    }).catch(() => undefined)
  })
  return <a href={href()} target="_blank" rel="noreferrer">Google Maps</a>
}
