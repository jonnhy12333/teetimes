import { Avatar } from '@ark-ui/solid/avatar'

interface CourseAvatarProps {
  class?: string
  logoUrl?: string
  name: string
}

export default function CourseAvatar(props: CourseAvatarProps) {
  return <Avatar.Root class={`course-avatar${props.class ? ` ${props.class}` : ''}`}>
    <Avatar.Fallback>{props.name.trim().charAt(0).toUpperCase()}</Avatar.Fallback>
    <Avatar.Image src={props.logoUrl} alt="" />
  </Avatar.Root>
}
