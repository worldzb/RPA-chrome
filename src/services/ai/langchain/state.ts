export type LangGraphChatState = {
  latestUserInput: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  latestResponse: string
  statusText: string
  config?: Record<string, any>
  stopReason?: string | null
}

export const createInitialChatState = (input: string, config?: Record<string, any>): LangGraphChatState => ({
  latestUserInput: input,
  messages: [],
  latestResponse: '',
  statusText: '',
  config
})
