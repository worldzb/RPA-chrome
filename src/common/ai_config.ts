export const AI_PROVIDER = {
  DEFAULT_MODEL: 'gpt-5.5',
  DEFAULT_BASE_URL: 'https://api.openai.com/v1'
} as const

export const NO_OPENAI_API_KEY_ERROR = 'E351: No OpenAI API key entered.'
export const NO_OPENAI_BASE_URL_ERROR = 'E353: No OpenAI baseUrl entered.'

import storage from '@/common/storage'

export async function getOpenAIConfig(config?: Record<string, any>) {
  const safeConfig = config || (await storage.get('config')) || {}

  console.log('--safeConfig---', safeConfig)

  return {
    apiKey: safeConfig.openaiApiKey || '',
    baseURL: safeConfig.openaiBaseUrl || AI_PROVIDER.DEFAULT_BASE_URL,
    model: safeConfig.openaiModel || AI_PROVIDER.DEFAULT_MODEL
  }
}
