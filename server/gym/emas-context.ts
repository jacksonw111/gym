export interface EmasFunctionContext {
  mpserverless: {
    user: {
      getInfo(): Promise<unknown>
    }
  }
}

interface UserInfoShape {
  user?: { userId?: unknown }
  result?: { user?: { userId?: unknown } }
}

// 云函数端 SDK（mpserverless-node-user-service）的 getInfo 直接返回 result 对象
// （{ user: { userId } }），而客户端 SDK 返回 { success, result }，两种结构都要兼容。
export const getEmasIdentity = async (
  context: EmasFunctionContext,
): Promise<{ emasUserId: string } | undefined> => {
  let response: UserInfoShape | undefined
  try {
    response = (await context.mpserverless.user.getInfo()) as UserInfoShape | undefined
  } catch {
    return undefined
  }
  const userId = response?.user?.userId ?? response?.result?.user?.userId
  return typeof userId === 'string' && userId ? { emasUserId: userId } : undefined
}
