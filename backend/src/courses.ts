import * as cheerio from 'cheerio'
import axios from 'axios'

export type CourseAuthType = 'none' | 'member-login' | 'oauth' | 'unknown'

export interface CourseConfig {
  id: string
  name: string
  city: string
  state: string
  bookingSystem: string
  bookingUrl: string
  websiteUrl?: string
  authType: CourseAuthType
  status?: 'active' | 'unsupported'
  latitude?: number
  longitude?: number
  timeZone?: string
  logoUrl?: string
  foreUp?: {
    courseId: number
    bookingClass: number
    scheduleId: number
  }
  easyTee?: {
    slug: string
  }
  supremeGolf?: {
    courseId: number
  }
  teeItUp?: {
    facilityId: number
    alias: string
  }
  totalEIntegrated?: {
    courseId: string
  }
  chronogolf?: {
    clubId: number
    courseId: number
    affiliationTypeId: number
    holes: 9 | 18
  }
  chronogolfV2?: {
    courseUuid: string
  }
  clubCaddie?: {
    courseId: number
    apiKey: string
  }
  notes?: string
}

export interface TeeTime {
  id: string
  courseId: string
  courseName: string
  time: string
  date: string
  holes: 9 | 18 | '9/18'
  options?: Array<{ holes: 9 | 18; price?: number }>
  price?: number
  cartFee?: number
  availableSpots?: number
  bookingUrl: string
  authRequired: boolean
  authType: CourseAuthType
}

interface ForeUpTeeTime {
  time: string
  course_name: string
  holes: 9 | 18 | '9/18'
  available_spots: number
  green_fee: number | false
  cart_fee: number | false
}

interface SupremeGolfTeeTimeGroup {
  type: string
  tee_off_at_timezone: string
  starting_rate: number | null
  players: number[]
  holes: Array<9 | 18>
  tee_times_ids: number[]
}

interface SupremeGolfResponse {
  tee_time_groups: SupremeGolfTeeTimeGroup[]
}

interface TeeItUpRate {
  _id: number
  holes: 9 | 18
  allowedPlayers: number[]
  greenFeeCart?: number
  greenFeeWalking?: number
}

interface TeeItUpTeeTime {
  teetime: string
  rates: TeeItUpRate[]
  maxPlayers: number
}

interface TeeItUpDay {
  teetimes: TeeItUpTeeTime[]
}

interface TotalETeeTime {
  Title: string
  PerPlayerCost?: number
  Holes: number
  AvailableSlot?: string
  Allow18: boolean
  Allow9: boolean
  GolfPrice9?: number
  GolfPrice18?: number
  CourseID: string
  Time: string
}

interface TotalETeeTimeResponse {
  TeeTimeData?: TotalETeeTime[]
  ErrorMessage?: string
}

interface ChronogolfGreenFee {
  price?: number
  green_fee?: number
  half_cart_price?: number
  half_cart?: number
}

interface ChronogolfTeeTime {
  id: number
  start_time: string
  out_of_capacity: boolean
  frozen: boolean
  green_fees?: ChronogolfGreenFee[]
}

interface ChronogolfV2TeeTime {
  id: number
  start_time: string
  max_player_size?: number
  frozen: boolean
  course: { bookable_holes: Array<9 | 18> }
  default_price?: {
    green_fee?: number
    half_cart?: number
    bookable_holes?: 9 | 18
  }
}

interface ChronogolfV2Response {
  status: string
  teetimes?: ChronogolfV2TeeTime[]
}

interface ClubCaddiePricingPlan {
  HoleRate_9?: number | null
  HoleRate_18?: number | null
}

interface ClubCaddieSlot {
  CourseId: number
  StartTime: string
  PlayersAvailable?: number
  PlayersAvailabilityFront?: number
  PricingPlan?: ClubCaddiePricingPlan[]
}

const supremeGolfApiKey = '61d982eb-185b-4146-8c5c-3a9e9c7197a0'

export const courses: CourseConfig[] = [
  {
    id: 'granite-fields-golf-club',
    name: 'Granite Fields Golf Club',
    city: 'Kingston',
    state: 'NH',
    bookingSystem: 'Easy Tee',
    bookingUrl: 'https://app.easyteegolf.com/course/granite-fields-golf-club/',
    websiteUrl: 'https://granitefields.com/',
    authType: 'none',
    latitude: 42.8628067,
    longitude: -71.0878971,
    logoUrl: '/course-logos/granite-fields.png',
    easyTee: {
      slug: 'granite-fields-golf-club',
    },
    notes: 'Public Easy Tee page with server-rendered tee times.',
  },
  {
    id: 'hoodkroft-country-club',
    name: 'Hoodkroft Country Club',
    city: 'Derry',
    state: 'NH',
    bookingSystem: 'ForeUP',
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/18836/3372#/teetimes',
    websiteUrl: 'https://www.hoodkroftcountryclub.com/home',
    authType: 'none',
    latitude: 42.888,
    longitude: -71.314,
    logoUrl: '/course-logos/hoodkroft.png',
    foreUp: {
      courseId: 18836,
      bookingClass: 5165,
      scheduleId: 3372,
    },
    notes: 'Public ForeUP tee times. Booking URL uses course 18836 and schedule 3372.',
  },
  {
    id: 'hidden-creek-golf-club',
    name: 'Hidden Creek Golf Club',
    city: 'Litchfield',
    state: 'NH',
    bookingSystem: 'ForeUP',
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/20454/4585#/teetimes?merchant_id=20454',
    websiteUrl: 'https://hiddencreeknh.com/',
    authType: 'none',
    latitude: 42.88058,
    longitude: -71.44939,
    logoUrl: '/course-logos/hidden-creek.png',
    foreUp: {
      courseId: 20454,
      bookingClass: 14991,
      scheduleId: 4585,
    },
    notes: 'Public ForeUP tee times. Booking may require a credit card.',
  },
  {
    id: 'hidden-valley-rv-and-golf-park',
    name: 'Hidden Valley RV & Golf Park',
    city: 'Derry',
    state: 'NH',
    bookingSystem: 'ForeUP',
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/21799/8917#/teetimes?merchant_id=21799',
    websiteUrl: 'https://www.hiddenvalleyrvgolf.com/',
    authType: 'none',
    latitude: 42.91597,
    longitude: -71.24145,
    logoUrl: '/course-logos/hidden-valley.png',
    foreUp: {
      courseId: 21799,
      bookingClass: 11772,
      scheduleId: 8917,
    },
    notes: 'Public ForeUP tee times. Coordinates still needed for weather.',
  },
  {
    id: 'passaconaway-country-club',
    name: 'Passaconaway Country Club',
    city: 'Litchfield',
    state: 'NH',
    bookingSystem: 'ForeUP',
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/20363/4577#/teetimes?merchant_id=20363',
    websiteUrl: 'https://passaconawaycc.com/',
    authType: 'none',
    latitude: 42.866,
    longitude: -71.477,
    logoUrl: '/course-logos/passaconaway.png',
    foreUp: {
      courseId: 20363,
      bookingClass: 14986,
      scheduleId: 4577,
    },
    notes: 'Public ForeUP tee times. Booking URL uses merchant 20363 and schedule 4577.',
  },
  {
    id: 'overlook-golf-club',
    name: 'Overlook Golf Club',
    city: 'Hollis',
    state: 'NH',
    bookingSystem: 'Chronogolf v2',
    bookingUrl: 'https://www.chronogolf.com/club/overlook-golf-club/teetimes',
    websiteUrl: 'https://overlookgolfclub.com/',
    authType: 'none',
    latitude: 42.7186155,
    longitude: -71.542304,
    logoUrl: '/course-logos/overlook.png',
    chronogolfV2: {
      courseUuid: 'c8913361-ea13-4fa3-8af8-a82c552fdc17',
    },
    notes: 'Public Chronogolf v2 marketplace tee times.',
  },
  {
    id: 'pine-valley-golf-course',
    name: 'Pine Valley Golf Course',
    city: 'Pelham',
    state: 'NH',
    bookingSystem: 'ForeUP',
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/22278/10318#/teetimes?merchant_id=22278',
    websiteUrl: 'https://www.pinevalleygolfcourse.com/',
    authType: 'none',
    latitude: 42.7382981,
    longitude: -71.3063836,
    logoUrl: '/course-logos/pine-valley.png',
    foreUp: {
      courseId: 22278,
      bookingClass: 14033,
      scheduleId: 10318,
    },
    notes: 'Public ForeUP tee times. Nine-hole course.',
  },
  {
    id: 'souhegan-woods-golf-club',
    name: 'Souhegan Woods Golf Club',
    city: 'Amherst',
    state: 'NH',
    bookingSystem: 'Chronogolf',
    bookingUrl: 'https://souheganwoods.com/',
    websiteUrl: 'https://souheganwoods.com/',
    authType: 'none',
    latitude: 42.8705,
    longitude: -71.6074,
    logoUrl: '/course-logos/souhegan-woods.png',
    chronogolf: {
      clubId: 9821,
      courseId: 11260,
      affiliationTypeId: 40106,
      holes: 18,
    },
    notes: 'Public Chronogolf marketplace tee times.',
  },
  {
    id: 'amherst-country-club',
    name: 'Amherst Country Club',
    city: 'Amherst',
    state: 'NH',
    bookingSystem: 'Club Caddie',
    bookingUrl: 'https://apimanager-cc28.clubcaddie.com/webapi/view/edfdabab/slots?CourseId=103435&apikey=edfdabab',
    websiteUrl: 'https://www.playamherst.com/amherst-country-club',
    authType: 'none',
    latitude: 42.8285037,
    longitude: -71.6040041,
    logoUrl: '/course-logos/amherst.png',
    clubCaddie: {
      courseId: 103435,
      apiKey: 'edfdabab',
    },
    notes: 'Public Club Caddie tee-time HTML endpoint with encoded slot data.',
  },
  {
    id: 'atkinson-country-club-18',
    name: 'Atkinson Country Club — 18 Hole',
    city: 'Atkinson',
    state: 'NH',
    bookingSystem: 'Total e Integrated',
    bookingUrl: 'https://atkinson.totaleintegrated.net/',
    websiteUrl: 'https://www.atkinsonresort.com/golf',
    authType: 'none',
    latitude: 42.8193814,
    longitude: -71.1823667,
    logoUrl: '/course-logos/atkinson.png',
    totalEIntegrated: {
      courseId: 'ATKINSON 18',
    },
    notes: 'Public Total e Integrated tee-time endpoint.',
  },
  {
    id: 'atkinson-country-club-par-3',
    name: 'Atkinson Country Club — Par 3',
    city: 'Atkinson',
    state: 'NH',
    bookingSystem: 'Total e Integrated',
    bookingUrl: 'https://atkinson.totaleintegrated.net/',
    websiteUrl: 'https://www.atkinsonresort.com/golf',
    authType: 'none',
    latitude: 42.8193814,
    longitude: -71.1823667,
    logoUrl: '/course-logos/atkinson.png',
    totalEIntegrated: {
      courseId: 'PAR 3',
    },
    notes: 'Public Total e Integrated tee-time endpoint.',
  },
  {
    id: 'campbells-scottish-highlands',
    name: "Campbell's Scottish Highlands",
    city: 'Salem',
    state: 'NH',
    bookingSystem: 'TeeItUp',
    bookingUrl: 'https://6391c422-2e57-4bc3-a1b3-8a6676c82588.book.teeitup.com/',
    websiteUrl: 'https://www.scottishhighlandsgolf.com/',
    authType: 'none',
    latitude: 42.756612,
    longitude: -71.2464334,
    timeZone: 'America/New_York',
    logoUrl: '/course-logos/scottish-highlands.png',
    teeItUp: {
      facilityId: 15773,
      alias: '6391c422-2e57-4bc3-a1b3-8a6676c82588',
    },
    notes: 'Public TeeItUp/Kenna endpoint.',
  },
  {
    id: 'merrimack-valley-golf-club',
    name: 'Merrimack Valley Golf Club',
    city: 'Methuen',
    state: 'MA',
    bookingSystem: 'TeeItUp',
    bookingUrl: 'https://merrimack-valley-golf-club.book.teeitup.com/',
    websiteUrl: 'https://merrimackvalleygolfclub.com/',
    authType: 'none',
    logoUrl: '/course-logos/merrimack-valley.png',
    latitude: 42.7537812,
    longitude: -71.1770565,
    timeZone: 'America/New_York',
    teeItUp: {
      facilityId: 16619,
      alias: 'merrimack-valley-golf-club',
    },
    notes: 'Public TeeItUp/Kenna endpoint.',
  },
  {
    id: 'the-links-at-labelle',
    name: 'The Links at LaBelle',
    city: 'Derry',
    state: 'NH',
    bookingSystem: 'TeeItUp',
    bookingUrl: 'https://the-links-at-labelle-winery.book.teeitup.com/',
    websiteUrl: 'https://labellewinery.com/labelle-winery-derry/golf/',
    authType: 'none',
    latitude: 42.8553431,
    longitude: -71.212806,
    timeZone: 'America/New_York',
    logoUrl: '/course-logos/labelle.png',
    teeItUp: {
      facilityId: 17037,
      alias: 'the-links-at-labelle-winery',
    },
    notes: 'Public TeeItUp/Kenna endpoint. Nine-hole par-3 course.',
  },
  {
    id: 'windham-country-club',
    name: 'Windham Country Club',
    city: 'Windham',
    state: 'NH',
    bookingSystem: 'TeeItUp',
    bookingUrl: 'https://windham-country.book.teeitup.com/',
    websiteUrl: 'https://windhamcc.com/',
    authType: 'none',
    latitude: 42.8192,
    longitude: -71.3124,
    timeZone: 'America/New_York',
    logoUrl: '/course-logos/windham-cc.png',
    teeItUp: {
      facilityId: 15931,
      alias: 'windham-country',
    },
    notes: 'Public TeeItUp/Kenna endpoint. Requires x-be-alias windham-country.',
  },
]

export function getCourseById(courseId: string) {
  return courses.find((course) => course.id === courseId)
}

function formatDateForForeUp(date: string) {
  const [year, month, day] = date.split('-')
  return `${month}-${day}-${year}`
}

function formatTimeLabel(value: string, timeZone?: string) {
  const date = new Date(value.replace(' ', 'T'))

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
}

function getDaysFromToday(date: string) {
  const today = new Date()
  const targetDate = new Date(`${date}T00:00:00`)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  return Math.max(0, Math.round((targetDate.getTime() - todayStart.getTime()) / 86400000))
}

async function getForeUpTeeTimes(course: CourseConfig, date: string): Promise<TeeTime[]> {
  if (!course.foreUp) {
    return []
  }

  const params = new URLSearchParams({
    time: 'all',
    date: formatDateForForeUp(date),
    holes: 'all',
    players: '0',
    booking_class: String(course.foreUp.bookingClass),
    schedule_id: String(course.foreUp.scheduleId),
    specials_only: '0',
    api_key: '',
  })
  params.append('schedule_ids[]', String(course.foreUp.scheduleId))

  const response = await fetch(`https://foreupsoftware.com/index.php/api/booking/times?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      Referer: course.bookingUrl,
    },
  })

  if (!response.ok) {
    throw new Error(`ForeUP request failed with ${response.status}`)
  }

  const teeTimes = await response.json() as ForeUpTeeTime[]

  return teeTimes.map((teeTime, index) => ({
    id: `${course.id}-${date}-${index}`,
    courseId: course.id,
    courseName: teeTime.course_name || course.name,
    time: formatTimeLabel(teeTime.time),
    date,
    holes: teeTime.holes,
    options: (teeTime.holes === '9/18' ? [9, 18] as const : [teeTime.holes]).map((holes) => ({ holes, price: typeof teeTime.green_fee === 'number' ? teeTime.green_fee : undefined })),
    price: typeof teeTime.green_fee === 'number' ? teeTime.green_fee : undefined,
    cartFee: typeof teeTime.cart_fee === 'number' ? teeTime.cart_fee : undefined,
    availableSpots: teeTime.available_spots,
    bookingUrl: course.bookingUrl,
    authRequired: false,
    authType: course.authType,
  }))
}

async function getEasyTeeTimes(course: CourseConfig, date: string): Promise<TeeTime[]> {
  if (!course.easyTee) {
    return []
  }

  const days = getDaysFromToday(date)
  const pageUrl = `https://app.easyteegolf.com/course/${course.easyTee.slug}/?days=${days}`
  const response = await fetch(pageUrl, {
    headers: {
      Accept: 'text/html',
    },
  })

  if (!response.ok) {
    throw new Error(`Easy Tee request failed with ${response.status}`)
  }

  const html = await response.text()
  const $ = cheerio.load(html)

  return $('.list-group-item').map((index, element) => {
    const item = $(element)
    const time = item.find('h3.font-weight-bold').first().text().trim()
    const playerRange = item.find('h6.text-muted').first().text().trim()
    const priceText = item.find('.col-auto h3').first().text().trim()
    const holesText = item.find('.badge').first().text().trim()
    const spotsMatch = playerRange.match(/-\s*(\d+)\s+golfers?/i) || playerRange.match(/(\d+)\s+golfers?/i)
    const holesMatch = holesText.match(/(9|18)/)
    const priceMatch = priceText.match(/\$([0-9]+(?:\.[0-9]+)?)/)

    if (!time || !holesMatch) {
      return null
    }

    const teeTime: TeeTime = {
      id: `${course.id}-${date}-${index}`,
      courseId: course.id,
      courseName: course.name,
      time,
      date,
      holes: Number(holesMatch[1]) as 9 | 18,
      price: priceMatch ? Number(priceMatch[1]) : undefined,
      options: [{ holes: Number(holesMatch[1]) as 9 | 18, price: priceMatch ? Number(priceMatch[1]) : undefined }],
      availableSpots: spotsMatch ? Number(spotsMatch[1]) : undefined,
      bookingUrl: course.bookingUrl,
      authRequired: false,
      authType: course.authType,
    }

    return teeTime
  }).get().filter((teeTime): teeTime is TeeTime => teeTime !== null)
}

async function getSupremeGolfTeeTimes(course: CourseConfig, date: string): Promise<TeeTime[]> {
  if (!course.supremeGolf) {
    return []
  }

  const params = new URLSearchParams({
    date,
    is_prepaid_only: 'false',
    include_featured: 'true',
    network_membership_only: 'false',
  })
  const response = await fetch(`https://api.supremegolf.com/api/v6/tee_time_groups/at/${course.supremeGolf.courseId}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'X-Api-Key': supremeGolfApiKey,
      Origin: 'https://supremegolf.com',
      Referer: 'https://supremegolf.com/',
    },
  })

  if (response.status === 403) {
    console.warn(`Supreme Golf blocked backend tee-time request for ${course.name}`)
    return []
  }

  if (!response.ok) {
    throw new Error(`Supreme Golf request failed with ${response.status}`)
  }

  const data = await response.json() as SupremeGolfResponse

  return data.tee_time_groups
    .filter((teeTimeGroup) => teeTimeGroup.type === 'tee_time')
    .map((teeTimeGroup, index) => ({
      id: `${course.id}-${date}-${teeTimeGroup.tee_times_ids[0] || index}`,
      courseId: course.id,
      courseName: course.name,
      time: formatTimeLabel(teeTimeGroup.tee_off_at_timezone),
      date,
      holes: teeTimeGroup.holes.length > 1 ? '9/18' : teeTimeGroup.holes[0],
      price: teeTimeGroup.starting_rate ?? undefined,
      options: teeTimeGroup.holes.map((holes) => ({ holes, price: teeTimeGroup.starting_rate ?? undefined })),
      availableSpots: teeTimeGroup.players.length ? Math.max(...teeTimeGroup.players) : undefined,
      bookingUrl: course.bookingUrl,
      authRequired: false,
      authType: course.authType,
    }))
}

function getTeeItUpRatePrice(rate: TeeItUpRate) {
  const priceInCents = rate.greenFeeCart ?? rate.greenFeeWalking

  return typeof priceInCents === 'number' ? priceInCents / 100 : undefined
}

async function getTeeItUpTeeTimes(course: CourseConfig, date: string): Promise<TeeTime[]> {
  if (!course.teeItUp) {
    return []
  }

  const params = new URLSearchParams({
    date,
    facilityIds: String(course.teeItUp.facilityId),
    returnPromotedRates: 'true',
  })
  const response = await fetch(`https://phx-api-be-east-1b.kenna.io/v2/tee-times?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'x-be-alias': course.teeItUp.alias,
      Origin: `https://${course.teeItUp.alias}.book.teeitup.com`,
      Referer: `https://${course.teeItUp.alias}.book.teeitup.com/`,
    },
  })

  if (!response.ok) {
    throw new Error(`TeeItUp request failed with ${response.status}`)
  }

  const days = await response.json() as TeeItUpDay[]
  const teeTimes = days.flatMap((day) => day.teetimes || [])

  return teeTimes.map((teeTime, index) => {
    const rates = teeTime.rates || []
    const holes = Array.from(new Set(rates.map((rate) => rate.holes))).sort()
    const prices = rates.map(getTeeItUpRatePrice).filter((price): price is number => typeof price === 'number')
    const options = ([9, 18] as const).flatMap((holes) => {
      const holePrices = rates.filter((rate) => rate.holes === holes).map(getTeeItUpRatePrice).filter((price): price is number => typeof price === 'number')
      return rates.some((rate) => rate.holes === holes) ? [{ holes, price: holePrices.length ? Math.min(...holePrices) : undefined }] : []
    })
    const primaryRate = rates[0]

    return {
      id: `${course.id}-${date}-${primaryRate?._id || index}`,
      courseId: course.id,
      courseName: course.name,
      time: formatTimeLabel(teeTime.teetime, course.timeZone),
      date,
      holes: holes.length > 1 ? '9/18' : holes[0],
      price: prices.length ? Math.min(...prices) : undefined,
      options,
      availableSpots: teeTime.maxPlayers || undefined,
      bookingUrl: course.bookingUrl,
      authRequired: false,
      authType: course.authType,
    }
  })
}

function getTotalEAvailableSpots(value?: string) {
  const values = value?.match(/\d+/g)?.map(Number) || []
  return values.length ? Math.max(...values) : undefined
}

async function getTotalETeeTimes(course: CourseConfig, date: string): Promise<TeeTime[]> {
  if (!course.totalEIntegrated) {
    return []
  }

  const params = new URLSearchParams({
    IsInitTeeTimeRequest: 'false',
    TeeTimeDate: date,
    CourseID: course.totalEIntegrated.courseId,
    StartTime: '05:45',
    EndTime: '18:30',
    NumOfPlayers: '0',
    Holes: '-1',
    IsNineHole: '-1',
    StartPrice: '0',
    EndPrice: '',
    CartIncluded: 'false',
    SpecialsOnly: '0',
    IsClosest: '0',
    PlayerIDs: '',
    DateFilterChange: 'false',
    DateFilterChangeNoSearch: 'false',
    SearchByGroups: 'true',
    IsPrepaidOnly: '0',
    CourseFavoritesChecked: 'true',
    QueryStringFilters: 'null',
  })
  const response = await fetch(`https://mt-gateway.totaleintegrated.net/Booking/Teetimes?${params.toString()}`, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Captcharequired: 'Booking_Teetimes',
      Captchavisibilitystate: 'Dialog',
      Origin: 'https://atkinson.totaleintegrated.net',
      Referer: course.bookingUrl,
    },
  })

  if (!response.ok) {
    throw new Error(`Total e Integrated request failed with ${response.status}`)
  }

  const data = await response.json() as TotalETeeTimeResponse
  if (data.ErrorMessage) {
    throw new Error(`Total e Integrated request failed: ${data.ErrorMessage}`)
  }

  return (data.TeeTimeData || []).map((teeTime, index) => {
    const options = ([9, 18] as const).flatMap((holes) => {
      const allowed = holes === 9 ? teeTime.Allow9 : teeTime.Allow18
      const price = holes === 9 ? teeTime.GolfPrice9 : teeTime.GolfPrice18
      return allowed ? [{ holes, price: typeof price === 'number' && price > 0 ? price : teeTime.PerPlayerCost }] : []
    })
    return {
    id: `${course.id}-${date}-${teeTime.CourseID}-${teeTime.Time || index}`,
    courseId: course.id,
    courseName: course.name,
    time: teeTime.Title,
    date,
    holes: teeTime.Holes === 9 || (!teeTime.Allow18 && teeTime.Allow9) ? 9 : 18,
    price: typeof teeTime.PerPlayerCost === 'number' ? teeTime.PerPlayerCost : undefined,
    options,
    availableSpots: getTotalEAvailableSpots(teeTime.AvailableSlot),
    bookingUrl: course.bookingUrl,
    authRequired: false,
    authType: course.authType,
    }
  })
}

function formatChronogolfTime(value: string) {
  const [hourText, minute] = value.split(':')
  const hour = Number(hourText)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12

  return `${displayHour}:${minute} ${period}`
}

async function getChronogolfTeeTimes(course: CourseConfig, date: string): Promise<TeeTime[]> {
  if (!course.chronogolf) {
    return []
  }

  const params = new URLSearchParams({
    date,
    course_id: String(course.chronogolf.courseId),
    nb_holes: String(course.chronogolf.holes),
  })
  params.append('affiliation_type_ids[]', String(course.chronogolf.affiliationTypeId))

  const response = await axios.get<ChronogolfTeeTime[]>(`https://www.chronogolf.com/marketplace/clubs/${course.chronogolf.clubId}/teetimes?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      Referer: course.bookingUrl,
      'User-Agent': 'Mozilla/5.0',
    },
  })
  const teeTimes = response.data

  return teeTimes
    .filter((teeTime) => !teeTime.out_of_capacity && !teeTime.frozen)
    .map((teeTime) => {
      const greenFee = teeTime.green_fees?.[0]

      return {
        id: `${course.id}-${date}-${teeTime.id}`,
        courseId: course.id,
        courseName: course.name,
        time: formatChronogolfTime(teeTime.start_time),
        date,
        holes: course.chronogolf!.holes,
        price: greenFee?.price ?? greenFee?.green_fee,
        options: [{ holes: course.chronogolf!.holes, price: greenFee?.price ?? greenFee?.green_fee }],
        cartFee: greenFee?.half_cart_price ?? greenFee?.half_cart,
        bookingUrl: course.bookingUrl,
        authRequired: false,
        authType: course.authType,
      }
    })
}

async function getChronogolfV2TeeTimes(course: CourseConfig, date: string): Promise<TeeTime[]> {
  if (!course.chronogolfV2) {
    return []
  }

  const teeTimes: ChronogolfV2TeeTime[] = []
  for (let page = 1; page <= 20; page += 1) {
    const params = new URLSearchParams({
      start_date: date,
      course_ids: course.chronogolfV2.courseUuid,
      holes: '9,18',
      page: String(page),
    })
    const response = await axios.get<ChronogolfV2Response>(`https://www.chronogolf.com/marketplace/v2/teetimes?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        Referer: course.bookingUrl,
        'User-Agent': 'Mozilla/5.0',
      },
    })
    const pageTeeTimes = response.data.teetimes || []
    teeTimes.push(...pageTeeTimes)
    if (!pageTeeTimes.length) break
  }

  const bookingParams = new URLSearchParams({
    date,
    holes: '',
    coursesIds: '',
    deals: 'false',
    groupSize: '0',
  })
  const datedBookingUrl = `${course.bookingUrl}?${bookingParams.toString()}`

  return teeTimes
    .filter((teeTime) => !teeTime.frozen)
    .map((teeTime) => {
      const bookableHoles = teeTime.course.bookable_holes || []
      const holes = teeTime.default_price?.bookable_holes || (bookableHoles.length > 1 ? '9/18' : bookableHoles[0])

      return {
        id: `${course.id}-${date}-${teeTime.id}`,
        courseId: course.id,
        courseName: course.name,
        time: formatChronogolfTime(teeTime.start_time),
        date,
        holes,
        price: teeTime.default_price?.green_fee,
        options: [{ holes: teeTime.default_price?.bookable_holes || (bookableHoles[0] ?? 18), price: teeTime.default_price?.green_fee }],
        cartFee: teeTime.default_price?.half_cart,
        availableSpots: teeTime.max_player_size,
        bookingUrl: datedBookingUrl,
        authRequired: false,
        authType: course.authType,
      }
    })
}

function formatDateForClubCaddie(date: string) {
  const [year, month, day] = date.split('-')
  return `${month}/${day}/${year}`
}

async function getClubCaddieTeeTimes(course: CourseConfig, date: string): Promise<TeeTime[]> {
  if (!course.clubCaddie) return []

  const searchParams = new URLSearchParams({
    date: formatDateForClubCaddie(date),
    player: 'any',
    holes: 'any',
    fromtime: '4',
    totime: '23',
    minprice: '0',
    maxprice: '999',
    ratetype: 'any',
    HoleGroup: 'front',
    CourseId: String(course.clubCaddie.courseId),
    apikey: course.clubCaddie.apiKey,
  })
  const response = await axios.post<string>('https://apimanager-cc28.clubcaddie.com/webapi/TeeTimes', searchParams.toString(), {
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: 'https://apimanager-cc28.clubcaddie.com',
      Referer: course.bookingUrl,
      'User-Agent': 'Mozilla/5.0',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  const $ = cheerio.load(response.data)
  const bookingParams = new URLSearchParams(searchParams)
  const bookingUrl = `https://apimanager-cc28.clubcaddie.com/webapi/view/${course.clubCaddie.apiKey}/slots?${bookingParams.toString()}`

  return ($('form[id^="TeeTimeSlotForm"]').map((index, form) => {
    const encodedSlot = $(form).find('input[name="slot"]').attr('value')
    if (!encodedSlot) return undefined
    try {
      const slot = JSON.parse(decodeURIComponent(encodedSlot)) as ClubCaddieSlot
      const options = ([9, 18] as const).flatMap((holes) => {
        const prices = (slot.PricingPlan || []).map((plan) => holes === 9 ? plan.HoleRate_9 : plan.HoleRate_18).filter((price): price is number => typeof price === 'number')
        return prices.length ? [{ holes, price: Math.min(...prices) }] : []
      })
      if (!options.length) return undefined
      const [hourText, minute = '00'] = slot.StartTime.split(':')
      const hour = Number(hourText)
      const displayTime = `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`
      const primaryOption = options.find((option) => option.holes === 18) || options[0]

      return {
        id: `${course.id}-${date}-${slot.StartTime}-${index}`,
        courseId: course.id,
        courseName: course.name,
        time: displayTime,
        date,
        holes: options.length > 1 ? '9/18' : primaryOption.holes,
        options,
        price: primaryOption.price,
        availableSpots: slot.PlayersAvailable ?? slot.PlayersAvailabilityFront,
        bookingUrl,
        authRequired: false,
        authType: course.authType,
      } satisfies TeeTime
    } catch {
      return undefined
    }
  }).get() as Array<TeeTime | undefined>).filter((teeTime): teeTime is TeeTime => Boolean(teeTime))
}

export async function getTeeTimesForCourse(course: CourseConfig, date: string): Promise<TeeTime[]> {
  if (course.bookingSystem === 'ForeUP') {
    return getForeUpTeeTimes(course, date)
  }

  if (course.bookingSystem === 'Easy Tee') {
    return getEasyTeeTimes(course, date)
  }

  if (course.bookingSystem === 'Supreme Golf') {
    return getSupremeGolfTeeTimes(course, date)
  }

  if (course.bookingSystem === 'TeeItUp') {
    return getTeeItUpTeeTimes(course, date)
  }

  if (course.bookingSystem === 'Total e Integrated') {
    return getTotalETeeTimes(course, date)
  }

  if (course.bookingSystem === 'Chronogolf') {
    return getChronogolfTeeTimes(course, date)
  }

  if (course.bookingSystem === 'Chronogolf v2') {
    return getChronogolfV2TeeTimes(course, date)
  }

  if (course.bookingSystem === 'Club Caddie') {
    return getClubCaddieTeeTimes(course, date)
  }

  return []
}
