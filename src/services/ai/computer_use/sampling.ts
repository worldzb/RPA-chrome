import ComputerUse, { ComputerUseActionResult } from './computer_use'
import { ComputerUseMessageType } from './model'

export interface SamplingParams {
  openaiApiKey: string
  openaiBaseUrl: string
  model: string
  captureScreenShotFunction: () => Promise<ArrayBuffer>
  handleMouseAction: (action: any, scaleFactor: number) => Promise<ComputerUseActionResult>
  handleKeyboardAction: (action: any) => Promise<ComputerUseActionResult>
  getTerminationRequest: (loopCompletedCount: number) => 'max_loop_reached' | 'player_stopped' | 'stop_requested' | undefined
  logMessage: (message: string, userOrAi?: ComputerUseMessageType, isActionOrResult?: 'action' | 'result') => void
}

export class SamplingError extends Error {
  messages: OpenAISamplingMessage[]
  constructor({ messages, error }: { messages: OpenAISamplingMessage[]; error: any }) {
    super(error?.message || String(error))
    this.messages = messages
  }
}

type ToolResult = any
export interface OpenAISamplingMessage {
  role: string
  content: any
  tool_calls?: any[]
}

export interface CallAPIReturnType {
  content: any
  tool_use: ToolUse[]
}

type Coordinate = [number, number]

export interface ToolUse {
  tool_use_id: string
  action?: string
  coordinate?: Coordinate | any
  coordinates?: Coordinate | any
  type?: string
  value?: string
}

class Sampling {
  systemPrompt: string = ''
  computer: any
  clientReady: boolean = false
  messages: OpenAISamplingMessage[] = []
  loopCompletedCount = 0

  constructor(private params: SamplingParams) {
    this.computer = new ComputerUse({
      captureScreenShotFunction: params.captureScreenShotFunction,
      handleMouseAction: params.handleMouseAction,
      handleKeyboardAction: params.handleKeyboardAction,
      logMessage: params.logMessage
    })

    if (params.openaiApiKey) {
      this.clientReady = true
    }
  }

  setAPIKey(apiKey: string, baseURL?: string) {
    this.params.openaiApiKey = apiKey
    this.params.openaiBaseUrl = baseURL || this.params.openaiBaseUrl
    this.clientReady = true
  }

  private toolSchemas() {
    return [
      {
        type: 'function',
        function: {
          name: 'mouse_move',
          description: 'Move mouse to x,y',
          parameters: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'left_click',
          description: 'Left click at x,y',
          parameters: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'right_click',
          description: 'Right click at x,y',
          parameters: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'double_click',
          description: 'Double click at x,y',
          parameters: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
            required: ['x', 'y']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'text',
          description: 'Type text',
          parameters: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value']
          }
        }
      }
    ]
  }

  async processToolUse(toolUse: CallAPIReturnType['tool_use']) {
    const toolResults = []
    for (const action of toolUse) {
      if (action.coordinate && Array.isArray(action.coordinate)) {
        action.coordinates = { x: action.coordinate[0], y: action.coordinate[1] }
        delete action.coordinate
      }

      const result = await this.computer.processAction(action)
      toolResults.push({
        tool_call_id: action.tool_use_id,
        role: 'tool',
        content: result.success ? result.message : result.error || 'Tool execution failed'
      })
    }
    return toolResults
  }

  async callAPI(params: any): Promise<CallAPIReturnType> {
    if (!this.clientReady) {
      throw new Error('OpenAI client is not initialized')
    }

    const response = await fetch(`${this.params.openaiBaseUrl.replace(/\/$/, '')}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.params.openaiApiKey}`
      },
      body: JSON.stringify({
        model: this.params.model,
        input: (() => {
          const latestUserMessage = [...params.messages].reverse().find((message: any) => message.role === 'user')
          if (!latestUserMessage) return []
          return [{
            role: 'user',
            content: typeof latestUserMessage.content === 'string'
              ? [{ type: 'input_text', text: latestUserMessage.content }]
              : latestUserMessage.content
          }]
        })(),
        // tools: this.toolSchemas(),
        // tool_choice: 'auto'
      })
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`${response.status} ${response.statusText}: ${text}`)
    }

    const json = await response.json()
    const output = json.output || []
    const aiResponseText = output
      .flatMap((item: any) => item.content || [])
      .filter((item: any) => item.type === 'output_text')
      .map((item: any) => item.text || '')
      .join('\n')
    if (aiResponseText) {
      this.params.logMessage(aiResponseText, 'ai')
    }

    const toolCalls = output
      .flatMap((item: any) => item.content || [])
      .filter((item: any) => item.type === 'tool_call')

    const toolUse = toolCalls.map((call: any) => {
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments || '{}') : (call.arguments || {})
      if (typeof args.x === 'number' && typeof args.y === 'number') {
        return {
          tool_use_id: call.id,
          action: call.function.name,
          coordinate: [args.x, args.y]
        }
      }
      return {
        tool_use_id: call.id,
        action: call.function.name,
        value: args.value,
        type: call.function.name
      }
    })

    if (toolUse[0]?.action) {
      const action = toolUse[0]
      const coordinateText = action.coordinate ? ` ${action.coordinate[0]}, ${action.coordinate[1]}` : ''
      const text = `${action.action}${coordinateText}`
      this.params.logMessage(text, 'ai', 'action')
      this.params.logMessage(text, 'status')
    }

    return {
      content: { content: aiResponseText, tool_calls: toolCalls },
      tool_use: toolUse
    }
  }

  async run(userMessage: string, messages: OpenAISamplingMessage[] | null = null): Promise<any> {
    if (!userMessage) {
      throw new Error('Prompt is required')
    }

    this.messages = messages || []
    this.systemPrompt = userMessage
    return this._run(userMessage)
  }

  private async _run(userMessage: string): Promise<any> {
    try {
      const stopReason = this.params.getTerminationRequest(this.loopCompletedCount)
      if (stopReason) {
        return { messages: this.messages, stopReason }
      }

      this.messages.push({ role: 'user', content: userMessage })
      this.params.logMessage('Calling API', 'status')

      const response = await this.callAPI({ messages: this.messages, system: this.systemPrompt })
      this.params.logMessage('API call complete', 'status')

      this.messages.push({ role: 'assistant', content: response.content.content || '' })
      this.loopCompletedCount++

      if (response.tool_use && response.tool_use.length > 0) {
        const toolResult = await this.processToolUse(response.tool_use)
        this.messages.push(...toolResult)
        return this._run('Continue with the task...')
      }

      return this.messages
    } catch (error) {
      throw new SamplingError({ messages: this.messages, error })
    }
  }
}

export default Sampling
