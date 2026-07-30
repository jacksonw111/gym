export interface CompletionActions {
  complete(): Promise<void>
  refreshCompleted(): Promise<void>
  saveFeedback(): Promise<void>
  hasFeedback?: boolean
}

export interface CompletionOutcome {
  completed: true
  feedbackSaved: boolean
}

export const completeThenSaveFeedback = async (
  actions: CompletionActions,
): Promise<CompletionOutcome> => {
  await actions.complete()
  await actions.refreshCompleted()

  if (actions.hasFeedback === false) {
    return { completed: true, feedbackSaved: true }
  }

  try {
    await actions.saveFeedback()
    return { completed: true, feedbackSaved: true }
  } catch {
    return { completed: true, feedbackSaved: false }
  }
}
