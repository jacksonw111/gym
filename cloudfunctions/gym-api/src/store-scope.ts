export type AdminPage = 'dashboard' | 'coaches' | 'members' | 'products' | 'bookings' | 'appeals'

export interface StoreRequest {
  action: string
  requestId: string
  payload: Record<string, unknown>
  identity?: { openId: string }
  authToken?: string
}
