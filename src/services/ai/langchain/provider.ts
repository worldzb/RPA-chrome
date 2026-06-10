import { getOpenAIConfig } from '@/common/ai_config'

export async function callResponsesAPI(config: Record<string, any>, userInput: string): Promise<string> {
  const aiConfig = await getOpenAIConfig(config)

  const response = await fetch(`${aiConfig.baseURL.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey}`
    },
    body: JSON.stringify({
      model: aiConfig.model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: userInput
            }
          ]
        }
      ]
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }

  const json = await response.json()
  return (json.output || [])
    .flatMap((item: any) => item.content || [])
    .filter((item: any) => item.type === 'output_text')
    .map((item: any) => item.text || '')
    .join('\n')
}

export async function streamResponsesAPI(
  config: Record<string, any>,
  userInput: string,
  onToken: (token: string) => void
): Promise<string> {
  const aiConfig = await getOpenAIConfig(config)

  const response = await fetch(`${aiConfig.baseURL.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey}`
    },
    body: JSON.stringify({
      model: aiConfig.model,
      stream: true,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: userInput
            }
          ]
        }
      ]
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }

  if (!response.body) {
    throw new Error('Streaming response body is empty')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''

    for (const chunk of chunks) {
      const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean)
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.replace(/^data:\s*/, '')
        if (payload === '[DONE]') continue

        try {
          const event = JSON.parse(payload)
          const delta =
            event.delta?.text ||
            event.output_text?.text ||
            event.text ||
            event.response?.output_text?.text ||
            ''

          if (delta) {
            fullText += delta
            onToken(delta)
          }
        } catch (_) {
          // ignore non-json or unsupported event frames
        }
      }
    }
  }

  return fullText
}
