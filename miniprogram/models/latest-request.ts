export interface RequestToken {
  sequence: number
  key: string
}

export class LatestRequestGate {
  private sequence = 0
  private key = ''

  begin(key: string): RequestToken {
    this.sequence += 1
    this.key = key
    return { sequence: this.sequence, key }
  }

  isCurrent(request: RequestToken, selectedKey: string): boolean {
    return (
      request.sequence === this.sequence && request.key === this.key && request.key === selectedKey
    )
  }
}
