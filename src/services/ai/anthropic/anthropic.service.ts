import { Jimp } from 'jimp'



import { getOpenAIConfig, NO_OPENAI_API_KEY_ERROR } from '@/common/ai_config'

interface Coordinates {
  coords: Array<{ x: number; y: number }>
  isSinglePoint?: boolean
}

type ScaleImageIfNeededResult = {
  buffer: ArrayBuffer
  scaleFactor: number
  originalWidth: number
  originalHeight: number
}

type ProcessImageResult = {
  coords: Array<{ x: number; y: number }>
  isSinglePoint?: boolean
  aiResponse: string
}

export { NO_OPENAI_API_KEY_ERROR as NO_AI_API_KEY_ERROR }

class AIService {
  private apiKey: string
  private baseURL: string
  private model: string
  MAX_WIDTH = 1280
  MAX_HEIGHT = 800
  MAX_TOKENS = 1024
  MAX_PIXELS = 1191888

  constructor(configOrApiKey: string | Record<string, any>, maybeBaseURL?: string, maybeModel?: string) {
    if (typeof configOrApiKey === 'string') {
      const config = {
        apiKey: configOrApiKey,
        baseURL: maybeBaseURL || 'https://api.openai.com/v1',
        model: maybeModel || 'gpt-5.5'
      }

      if (!config.apiKey) {
        throw new Error(NO_OPENAI_API_KEY_ERROR)
      }

      this.apiKey = config.apiKey
      this.baseURL = config.baseURL.replace(/\/$/, '')
      this.model = config.model
      return
    }

    const safeConfig = configOrApiKey || {}
    if (!safeConfig.openaiApiKey) {
      throw new Error(NO_OPENAI_API_KEY_ERROR)
    }

    this.apiKey = safeConfig.openaiApiKey
    this.baseURL = (safeConfig.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
    this.model = safeConfig.openaiModel || 'gpt-5.5'
  }

  uivError = (error: any) => {
    if (error instanceof Error) {
      if (/api key/i.test(error.message) && /missing|required|provide/i.test(error.message)) {
        return new Error(NO_OPENAI_API_KEY_ERROR)
      }
      if (/incorrect api key|invalid api key|authentication/i.test(error.message)) {
        return new Error('Invalid API key. Please re-enter and save it.')
      }
      return new Error(`E352: OpenAI-compatible API returned error: ${error.message}`)
    }
    return new Error(`E352: OpenAI-compatible API returned error: ${error?.message || error}`)
  }

  private async postResponses(input: any[]) {
    const response = await fetch(`${this.baseURL.replace(/\/$/, '')}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input,
        max_output_tokens: this.MAX_TOKENS
      })
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`${response.status} ${response.statusText}: ${text}`)
    }

    return response.json()
  }

  private extractText(response: any): string {
    return (response.output || [])
      .flatMap((item: any) => item.content || [])
      .filter((item: any) => item.type === 'output_text')
      .map((item: any) => item.text || '')
      .join('\n')
  }

  private async completeText(parts: any[]): Promise<string> {
    const response = await this.postResponses([
      {
        role: 'user',
        content: parts
      }
    ])

    return this.extractText(response)
  }

  private toResponseInput(parts: any[]) {
    return parts.map((part: any) => {
      if (part.type === 'text') {
        return { type: 'input_text', text: part.text }
      }
      if (part.type === 'image_url') {
        return { type: 'input_image', image_url: part.image_url.url }
      }
      return part
    })
  }

  private async completeText(parts: any[]): Promise<string> {
    const response = await this.postResponses([
      {
        role: 'user',
        content: this.toResponseInput(parts)
      }
    ])

    return this.extractText(response)
  }

  parseCoordinates(responseText: string): Coordinates {
    const parts = responseText.split('|||').filter((part) => part.trim())
    const coordinates = parts
      .map((part) => {
        const matches = part.match(/(\d+)\s*,\s*(\d+)/)
        if (matches) {
          return {
            x: parseInt(matches[1]),
            y: parseInt(matches[2])
          }
        }
        return null
      })
      .filter((coord) => coord !== null)

    return {
      coords: coordinates as Array<{ x: number; y: number }>,
      isSinglePoint: coordinates.length === 1
    }
  }

  async getPromptResponse(promptText: string): Promise<string> {
    try {
      return await this.completeText([{ type: 'text', text: promptText }])
    } catch (error) {
      throw this.uivError(error)
    }
  }

  async readTextInImage(imageBuffer: ArrayBuffer): Promise<string> {
    try {
      const mainImageBase64 = Buffer.from(imageBuffer).toString('base64')
      return await this.completeText([
        { type: 'text', text: 'Read text in the image' },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${mainImageBase64}`
          }
        }
      ])
    } catch (error) {
      throw this.uivError(error)
    }
  }

  async scaleImageIfNeeded(imageBuffer: ArrayBuffer): Promise<ScaleImageIfNeededResult> {
    const image = await Jimp.read(imageBuffer)
    const metadata = {
      width: image.bitmap.width,
      height: image.bitmap.height
    }

    let scaleFactor = 1
    if (metadata.width > this.MAX_WIDTH || metadata.height > this.MAX_HEIGHT) {
      const widthRatio = this.MAX_WIDTH / metadata.width
      const heightRatio = this.MAX_HEIGHT / metadata.height
      scaleFactor = Math.min(widthRatio, heightRatio)
      const newWidth = Math.round(metadata.width * scaleFactor)
      const newHeight = Math.round(metadata.height * scaleFactor)
      image.resize({ w: newWidth, h: newHeight })
      const imageArrayBuffer = await image.getBuffer('image/png')
      return {
        buffer: imageArrayBuffer,
        scaleFactor,
        originalWidth: metadata.width,
        originalHeight: metadata.height
      }
    }

    return {
      buffer: imageBuffer,
      scaleFactor,
      originalWidth: metadata.width,
      originalHeight: metadata.height
    }
  }

  async aiPromptProcessImage(mainImageBuffer: ArrayBuffer | null, searchImageBuffer: ArrayBuffer | null, promptText: string): Promise<ProcessImageResult> {
    try {
      const mainImageData = mainImageBuffer && (await this.scaleImageIfNeeded(mainImageBuffer))
      const searchImageData = searchImageBuffer && (await this.scaleImageIfNeeded(searchImageBuffer))
      const mainImageBase64 = mainImageData && Buffer.from(mainImageData.buffer).toString('base64')
      const searchImageBase64 = searchImageData && Buffer.from(searchImageData.buffer).toString('base64')

      const content: any[] = [{ type: 'text', text: `${promptText}\nReturn only coordinates like x,y||| or x1,y1|||x2,y2||| if needed.` }]

      if (mainImageBase64) {
        content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${mainImageBase64}` } })
      }
      if (searchImageBase64) {
        content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${searchImageBase64}` } })
      }

      const aiResponse = await this.completeText(content)
      if (aiResponse.toLowerCase().includes('not found')) {
        throw new Error('Reference image could not be found in the main image')
      }

      const { coords: scaledCoords, isSinglePoint } = this.parseCoordinates(aiResponse)
      if (!mainImageData || scaledCoords.length === 0) {
        return { coords: [{ x: 0, y: 0 }], isSinglePoint: false, aiResponse }
      }

      const originalCoords = scaledCoords.map((coord) => ({
        x: Math.round(coord.x / mainImageData.scaleFactor),
        y: Math.round(coord.y / mainImageData.scaleFactor)
      }))

      return { coords: originalCoords, isSinglePoint, aiResponse }
    } catch (error: any) {
      throw new Error('Error processing image:' + (error.message || ''))
    }
  }

  parseCoordinatesNew(responseText: string) {
    if (!responseText) return { coords: [], isSinglePoint: false }
    return this.parseCoordinates(responseText)
  }

  async aiScreenXYProcessImage(imageBuffer: ArrayBuffer, promptText: string): Promise<ProcessImageResult> {
    try {
      const image = await Jimp.read(imageBuffer)
      const metadata = { width: image.bitmap.width, height: image.bitmap.height }
      let scaledBuffer = imageBuffer
      let scaleFactor = 1
      let scaledWidth = metadata.width
      let scaledHeight = metadata.height
      const totalPixels = metadata.width * metadata.height

      if (totalPixels > this.MAX_PIXELS) {
        scaleFactor = Math.sqrt(this.MAX_PIXELS / totalPixels)
        scaledWidth = Math.round(metadata.width * scaleFactor)
        scaledHeight = Math.round(metadata.height * scaleFactor)
        image.resize({ w: scaledWidth, h: scaledHeight })
        scaledBuffer = await image.getBuffer('image/png')
      }

      const imageBase64 = Buffer.from(scaledBuffer).toString('base64')
      const prompt = `${promptText}. Analyze the provided image (${scaledWidth} x ${scaledHeight} pixels). Return ONLY the x,y coordinates in this format: x,y|||`
      const computerUseText = await this.completeText([
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
      ])

      const computerUseCoords = this.parseCoordinatesNew(computerUseText)
      const originalComputerUseCoords = computerUseCoords.coords.map((coord) => ({
        x: Math.round(coord.x / scaleFactor / window.devicePixelRatio),
        y: Math.round(coord.y / scaleFactor / window.devicePixelRatio)
      }))

      return {
        coords: originalComputerUseCoords,
        isSinglePoint: computerUseCoords.isSinglePoint,
        aiResponse: computerUseText
      }
    } catch (error: any) {
      throw this.uivError(error)
    }
  }
}

export default AIService
