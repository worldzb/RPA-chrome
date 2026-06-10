import React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators, Dispatch } from 'redux'
import { Button, message } from 'antd'

import * as actions from '@/actions'
import { Actions as simpleActions } from '@/actions/simple_actions'
import { State } from '@/reducers/state'
import './ai-chat.scss'
import { ConversationItem, Sender } from './ai_conversation'
import { streamAiChatGraph } from '@/services/ai/langchain'

type SenderWithError = Sender | 'Error'

interface AiChatState {
  processRunning: boolean
  conversation: Array<ConversationItem | { sender: SenderWithError; message: string }>
  aiPromptText: string
}

interface AiChatStateProps {
  config: { [key: string]: any }
  renderStatus: (statusText: string) => void
}

const normalizeErrorMessage = (error: any) => error?.message || String(error || '未知错误')

class AiChat extends React.Component<AiChatStateProps, AiChatState> {
  conversationRef: React.RefObject<HTMLDivElement>

  constructor(props: AiChatStateProps) {
    super(props)
    this.conversationRef = React.createRef<HTMLDivElement>()
  }

  state: AiChatState = {
    processRunning: false,
    conversation: [],
    aiPromptText: ''
  }

  scrollToBottom = () => {
    setTimeout(() => {
      if (this.conversationRef.current) {
        this.conversationRef.current.scrollTop = this.conversationRef.current.scrollHeight
      }
    }, 100)
  }

  addConversation = (sender: SenderWithError, message: string) => {
    this.setState(
      {
        conversation: [...this.state.conversation, { sender, message }]
      },
      this.scrollToBottom
    )
  }

  updateStreamingAssistantMessage = (text: string) => {
    this.setState(
      (prevState) => {
        const conversation = prevState.conversation.slice()
        const lastItem = conversation[conversation.length - 1]

        if (!lastItem || lastItem.sender !== 'AI') {
          conversation.push({ sender: 'AI', message: text })
        } else {
          conversation[conversation.length - 1] = { ...lastItem, message: text }
        }

        return { conversation }
      },
      this.scrollToBottom
    )
  }

  componentDidMount() {
    const useInitialPromptInAiChat = this.props.config.useInitialPromptInAiChat
    const aiChatSidebarPrompt = this.props.config.aiChatSidebarPrompt
    if (useInitialPromptInAiChat && aiChatSidebarPrompt) {
      this.send(aiChatSidebarPrompt)
    }
  }

  send = async (prompt_?: string) => {
    const prompt = prompt_ || this.state.aiPromptText
    if (this.state.processRunning || prompt === '') {
      return
    }

    this.addConversation('You', prompt)
    this.setState({ processRunning: true })
    this.props.renderStatus('正在调用 AI...')

    let fullText = ''

    try {
      await streamAiChatGraph(
        this.props.config,
        prompt,
        (token) => {
          fullText += token
          this.updateStreamingAssistantMessage(fullText)
        },
        (status) => this.props.renderStatus(status)
      )
    } catch (error: any) {
      const errorMessage = normalizeErrorMessage(error)
      message.error(errorMessage)
      this.addConversation('Error', errorMessage)
      this.props.renderStatus('调用失败')
    } finally {
      this.setState({ processRunning: false })
    }
  }

  stop = () => {
    this.setState({ processRunning: false })
  }

  newChat = () => {
    if (this.state.processRunning) return
    this.setState({ conversation: [] })
  }

  render() {
    return (
      <>
        <div className="ai-chat">
          <div ref={this.conversationRef} className="ai-conversation">
            {this.state.conversation.map((item, i) => {
              return (
                <div className="ai-conversation-item" key={i}>
                  <div
                    className={`${item.sender === 'Error' ? 'sender-error' : item.sender === 'You' ? 'sender-you' : item.sender === 'AI' ? 'sender-ai' : 'sender-action'}`}
                  >
                    <span className="sender">{`${item.sender}: `}</span>
                    {item.message}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="chat-footer">
          <textarea
            className="chat-input"
            value={this.state.aiPromptText}
            onChange={(e) => this.setState({ aiPromptText: e.target.value })}
          />
          <div className="chat-actions">
            <Button type="primary" onClick={() => this.send()} disabled={this.state.processRunning}>
              发送
            </Button>
            <Button onClick={this.stop} disabled={!this.state.processRunning}>
              停止
            </Button>
            <Button onClick={this.newChat} disabled={this.state.processRunning}>
              新建对话
            </Button>
          </div>
        </div>
      </>
    )
  }
}

export default connect(
  (state: State) => ({
    config: state.config
  }),
  (dispatch: Dispatch) => bindActionCreators({ ...actions, ...simpleActions }, dispatch)
)(AiChat)
