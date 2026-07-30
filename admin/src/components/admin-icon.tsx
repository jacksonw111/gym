export type AdminIconName =
  | 'dashboard'
  | 'coaches'
  | 'members'
  | 'products'
  | 'bookings'
  | 'appeals'

const paths: Record<AdminIconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="5" height="5" />
      <rect x="12" y="3" width="5" height="5" />
      <rect x="3" y="12" width="5" height="5" />
      <rect x="12" y="12" width="5" height="5" />
    </>
  ),
  coaches: (
    <>
      <circle cx="10" cy="6" r="3" />
      <path d="M4.5 17c.4-3.2 2.2-5 5.5-5s5.1 1.8 5.5 5" />
    </>
  ),
  members: (
    <>
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="14" cy="8" r="2" />
      <path d="M2.8 17c.3-3 1.7-4.7 4.2-4.7s4 1.7 4.3 4.7M12 13.2c2.8-.5 4.7.8 5.2 3.8" />
    </>
  ),
  products: (
    <>
      <path d="M3 6.5 10 3l7 3.5-7 3.6z" />
      <path d="M3 6.5V14l7 3 7-3V6.5M10 10.1V17" />
    </>
  ),
  bookings: (
    <>
      <rect x="3" y="4.5" width="14" height="13" rx="1.5" />
      <path d="M6 2.5v4M14 2.5v4M3 8.5h14M7 12h6" />
    </>
  ),
  appeals: (
    <>
      <path d="M10 2.8 18 17H2z" />
      <path d="M10 7v4.5M10 14.5v.2" />
    </>
  ),
}

export function AdminIcon({ name }: { name: AdminIconName }) {
  return (
    <svg
      className="admin-icon"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
