import React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators, Dispatch } from 'redux'
import { Button, Checkbox, Form, Input, Modal } from 'antd'
import { getStorageManager } from '@/services/storage'
import AnthropicService, { NO_ANTHROPIC_API_KEY_ERROR } from '@/services/ai/anthropic/anthropic.service'
import { Actions as simpleActions } from '@/actions/simple_actions'
import * as actions from '@/actions'
import { State } from '@/reducers/state'
import { message } from 'antd'

interface AiTabProps {
  config: { [key: string]: any }
  updateConfig: (config: { [key: string]: any }) => void
}

interface AiTabAppState {
  openaiApiKey: string
  openaiBaseUrl: string
  prompt: string 
  promptResponse: string
  error: string
}

class AITab extends React.Component<AiTabProps, AiTabAppState> {
  constructor(props: any) {
    super(props)
    this.onClickTestPrompt = this.onClickTestPrompt.bind(this)
  }

  state: AiTabAppState = {
    openaiApiKey: '',
    openaiBaseUrl: '',
    prompt: '解释一个随机的 AI RPA 命令',
    promptResponse: '',
    error: ''
  }

  async onClickTestPrompt() {
    const openaiApiKey = this.props.config.openaiApiKey || ''
    if (!openaiApiKey) {
      message.error(NO_ANTHROPIC_API_KEY_ERROR)
      return
    }

    const anthropicService = new AnthropicService(this.props.config)

    anthropicService
      ?.getPromptResponse(this.state.prompt)
      .then((response) => {
        this.setState({ promptResponse: response })
        this.setState({ error: '' })
      })
      .catch((error) => {
        console.error('Error getting response:', error)
        // this.setState({ error: error.message })
        message.error(error.message)
      })
  }

  render() {
    const onConfigChange = (key: string, val: any) => {
      this.props.updateConfig({ [key]: val })
    }

    return (
      <div className="ai-tab">
        <div className="row" style={{ marginBottom: '20px' }}>
          AI 命令功能目前处于实验 / 测试阶段。它使用 OpenAI 兼容接口。要启用 AI 命令，请在下方输入你的
          OpenAI API Key 与 baseUrl{' '}
          <a href="https://goto.ui.vision/x/idehelp?help=ai" target="_blank">
            {' '}
            （更多信息）
          </a>
          :
        </div>

        <div className="ai-settings-item">
          <span className="label-text">API Key：</span>
          <Input
            type="text"
            value={this.state.openaiApiKey}
            onChange={(e) => {
              this.setState({ openaiApiKey: e.target.value })
            }}
          />
          <Button
            type="primary"
            onClick={() => {
              if (this.props.config.openaiApiKey) {
                Modal.confirm({
                  title: '确认',
                  content: '是否覆盖现有的 API Key？',
                  okText: '是',
                  cancelText: '否',
                  onOk: () => {
                    onConfigChange('openaiApiKey', this.state.openaiApiKey)
                    onConfigChange('openaiBaseUrl', this.state.openaiBaseUrl || this.props.config.openaiBaseUrl || 'https://api.openai.com/v1')
                    onConfigChange('openaiModel', 'gpt-5.5')
                    this.setState({ openaiApiKey: '', openaiBaseUrl: '' })
                  }
                })
              } else {
                onConfigChange('openaiApiKey', this.state.openaiApiKey)
                onConfigChange('openaiBaseUrl', this.state.openaiBaseUrl || this.props.config.openaiBaseUrl || 'https://api.openai.com/v1')
                onConfigChange('openaiModel', 'gpt-5.5')
                this.setState({ openaiApiKey: '', openaiBaseUrl: '' })
              }
            }}
            // disabled={this.state.anthropicAPIKey == this.props.config.anthropicAPIKey}
          >
            保存
          </Button>
        </div>
        <div className="ai-settings-item">
          <span className="label-text">模型：</span>
          <Input
            type="text"
            value={this.props.config.openaiModel || 'gpt-5.5'}
            onChange={(e) => {
              onConfigChange('openaiModel', e.target.value)
            }}
          />
        </div>
        <div className="ai-settings-item">
          <span className="label-text">baseUrl：</span>
          <Input
            type="text"
            value={this.state.openaiBaseUrl}
            onChange={(e) => {
              this.setState({ openaiBaseUrl: e.target.value })
            }}
            placeholder={this.props.config.openaiBaseUrl || 'https://api.openai.com/v1'}
          />
        </div>
        <div className="ai-settings-item">
          <span className="label-text">提示词：</span>
          <Input
            type="text"
            value={this.state.prompt || '你好，Claude'} //is this text used anywhere?
            onChange={(e) => {
              this.setState({ prompt: e.target.value })
            }}
          />
          <Button type="primary" onClick={this.onClickTestPrompt}>
            测试
          </Button>
        </div>
        <div className="row" style={{ marginBottom: '10px' }}>
          OpenAI 兼容接口返回结果：
        </div>
        <div className="ai-response">
          <pre>{this.state.promptResponse}</pre>
        </div>
        <div className="ai-settings-item">
          <span className="label-text">
            <strong>aiComputerUse：</strong> 停止前的最大循环次数：{' '}
          </span>
          <Input
            type="number"
            min="0"
            style={{ marginLeft: '10px', width: '70px' }}
            value={this.props.config.aiComputerUseMaxLoops}
            onChange={(e) => onConfigChange('aiComputerUseMaxLoops', e.target.value)}
            placeholder=""
          />
        </div>

        <div className="ai-chat-in-sidebar">
          <Checkbox
            onClick={(e) => {
              onConfigChange('useInitialPromptInAiChat', (e.target as HTMLInputElement).checked)
            }}
            checked={this.props.config.useInitialPromptInAiChat}
          >
            在侧边栏中启用 AI 对话，并使用初始提示词。
          </Checkbox>
          <Input
            type="text"
            value={this.props.config.aiChatSidebarPrompt || '请用不超过 10 个词描述你看到的内容。'}
            onChange={(e) => {
              onConfigChange('aiChatSidebarPrompt', e.target.value)
            }}
          />
        </div>

        <div className="row" style={{ marginBottom: '10px', color: 'red' }}>
          {this.state.error}
        </div>
      </div>
    )
  }
}

export default connect(
  (state: State) => ({
    status: state.status,
    config: state.config
  }),
  (dispatch: Dispatch) => bindActionCreators({ ...actions, ...simpleActions }, dispatch)
)(AITab)
