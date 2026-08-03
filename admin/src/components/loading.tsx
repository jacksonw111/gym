export function ButtonLoading({ label }: { label: string }) {
  return (
    <span className="button-loading">
      <span className="button-spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

export function BeanEaterTransition({ label }: { label: string }) {
  return (
    <div className="page-transition" role="status" aria-label={`正在前往${label}`}>
      <div className="bean-eater" aria-hidden="true">
        <div className="bean-eater__stage">
          <div className="bean-eater__pellets">
            <div className="bean-eater__pellet" />
            <div className="bean-eater__pellet" />
            <div className="bean-eater__pellet" />
          </div>
          <div className="bean-eater__mouths">
            <div className="bean-eater__mouth" />
            <div className="bean-eater__mouth" />
            <div className="bean-eater__mouth" />
          </div>
        </div>
      </div>
      <div className="page-transition__copy">
        <span>PURUI / MOVE</span>
        <strong>正在前往{label}</strong>
      </div>
    </div>
  )
}
