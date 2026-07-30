interface PhoneOpenData {
  list?: Array<{
    data?: {
      phoneNumber?: string
      purePhoneNumber?: string
    }
  }>
}

export const phoneNumberFromOpenData = (result: PhoneOpenData): string => {
  const phone = result.list?.[0]?.data?.purePhoneNumber ?? result.list?.[0]?.data?.phoneNumber
  if (!phone || !/^1\d{10}$/.test(phone)) {
    throw new Error('手机号授权结果无效，请重新授权')
  }
  return phone
}
