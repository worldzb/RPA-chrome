import { StateGraph, START, END } from '@langchain/langgraph'
import { callResponsesAPI, streamResponsesAPI } from './provider'
import { createInitialChatState, LangGraphChatState } from './state'

const graph = new StateGraph<LangGraphChatState>({
  channels: {
    latestUserInput: null as any,
    messages: null as any,
    latestResponse: null as any,
    statusText: null as any,
    config: null as any,
    stopReason: null as any
  }
})

.addNode('ingestUserInput', async (state) => ({
  ...state,
  statusText: 'Preparing request...'
}))
.addNode('callModel', async (state: LangGraphChatState & { config: Record<string, any> }) => {
  const text = await callResponsesAPI((state as any).config, state.latestUserInput)
  return {
    ...state,
    latestResponse: text,
    statusText: 'Response received',
    messages: [...state.messages, { role: 'user', content: state.latestUserInput }, { role: 'assistant', content: text }]
  }
})
.addNode('finalize', async (state) => ({
  ...state,
  statusText: 'Done'
}))
.addEdge(START, 'ingestUserInput')
.addEdge('ingestUserInput', 'callModel')
.addEdge('callModel', 'finalize')
.addEdge('finalize', END)

const compiled = graph.compile()

export async function runAiChatGraph(config: Record<string, any>, userInput: string) {
  return compiled.invoke(createInitialChatState(userInput, config) as any)
}

export async function streamAiChatGraph(
  config: Record<string, any>,
  userInput: string,
  onToken: (token: string) => void,
  onStatus?: (status: string) => void
) {
  onStatus?.('Preparing request...')
  const text = await streamResponsesAPI(config, userInput, onToken)
  onStatus?.('Done')
  return {
    ...createInitialChatState(userInput, config),
    latestResponse: text,
    statusText: 'Done',
    messages: [
      { role: 'user', content: userInput },
      { role: 'assistant', content: text }
    ]
  }
}
