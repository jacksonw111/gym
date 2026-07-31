export interface EmasFunctionContext {
  mpserverless: {
    user: {
      getInfo(): Promise<{
        success?: boolean
        result?: {
          user?: {
            userId?: string
          }
        }
      }>
    }
  }
}

export const getEmasIdentity = async (
  context: EmasFunctionContext,
): Promise<{ emasUserId: string } | undefined> => {
  const response = await context.mpserverless.user.getInfo()
  const userId = response.result?.user?.userId
  return userId ? { emasUserId: String(userId) } : undefined
}
