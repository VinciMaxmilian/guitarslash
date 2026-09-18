import { useState } from 'react'
import '../styles/riff-riot.css'

import type { AuthState } from '../auth/useAuth'
import { useUISounds } from '../hooks/useUISounds'

interface Props {
  auth: AuthState
  onBack: () => void
}

type Modo = 'entrar' | 'criar'

export function AuthScreen({ auth, onBack }: Props) {
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const uiSounds = useUISounds()

  const criando = modo === 'criar'
  const podeEnviar =
    email.includes('@') && senha.length >= 6 && (!criando || nome.trim().length > 0)

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!podeEnviar || enviando) return
    setEnviando(true)
    setAviso(null)

    const ok = criando
      ? await auth.signUp(email.trim(), senha, nome)
      : await auth.signIn(email.trim(), senha)

    setEnviando(false)
    if (!ok) return

    if (criando) {
      // Com confirmacao de e-mail ligada no projeto, o cadastro nao entra
      // direto; sem avisar, a tela parece nao ter feito nada.
      setAviso(
        auth.session
          ? 'Conta criada.'
          : 'Conta criada. Se o projeto exigir confirmação, verifique seu e-mail.',
      )
      setModo('entrar')
    }
  }

  const trocarModo = () => {
    uiSounds.play('scroll')
    auth.clearError()
    setAviso(null)
    setModo(criando ? 'entrar' : 'criar')
  }

  return (
    <div className="rr-screen screen-diff">
      <div className="diff-bg-1" />
      <div className="diff-bg-2" />

      <div className="lobby">
        <div className="lobby-header">
          <div className="lobby-title">{criando ? 'CRIAR CONTA' : 'ENTRAR'}</div>
        </div>

        {!auth.enabled ? (
          <div className="auth-card">
            <p className="mp-start-p">
              Conta, leaderboard e músicas da comunidade precisam do Supabase
              configurado neste build.
            </p>
            <div className="auth-vars">
              <div>VITE_SUPABASE_URL</div>
              <div>VITE_SUPABASE_ANON_KEY</div>
            </div>
            <p className="mp-start-p">
              Em desenvolvimento, coloque as duas em <code>frontend/.env</code> e{' '}
              <strong>reinicie o servidor</strong> — o Vite lê o .env só na
              inicialização. No Netlify, em Environment variables (elas entram no
              build, então exige novo deploy).
            </p>
            <p className="mp-start-p">
              O resto do jogo funciona sem isso: biblioteca local, singleplayer e
              multiplayer LAN.
            </p>
          </div>
        ) : auth.loading ? (
          <div className="auth-card">
            <p className="mp-start-p">Verificando sessão...</p>
          </div>
        ) : auth.session ? (
          <div className="auth-card">
            <p className="mp-start-p">
              Conectado como <strong>{auth.displayName ?? auth.session.user.email}</strong>.
            </p>
            <p className="mp-start-p">
              Seus placares vão para o leaderboard, suas configurações
              acompanham a conta e você pode enviar músicas para a comunidade.
            </p>
            <button
              className="btn"
              onClick={() => {
                uiSounds.play('back')
                void auth.signOut()
              }}
            >
              <span>SAIR DA CONTA</span>
            </button>
          </div>
        ) : (
          <form className="auth-card" onSubmit={enviar}>
            <p className="mp-start-p">
              A conta guarda suas configurações, seus placares e a sua posição no leaderboard.
              Jogar sem conta continua funcionando.
            </p>

            {criando && (
              <label className="auth-field">
                NOME NO JOGO
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value.slice(0, 24))}
                  autoComplete="nickname"
                  placeholder="Como aparece no leaderboard"
                />
              </label>
            )}

            <label className="auth-field">
              E-MAIL
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
              />
            </label>

            <label className="auth-field">
              SENHA
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete={criando ? 'new-password' : 'current-password'}
              />
              {criando && senha.length > 0 && senha.length < 6 && (
                <span className="auth-hint">mínimo de 6 caracteres</span>
              )}
            </label>

            {auth.error && <div className="lobby-warning">{auth.error}</div>}
            {aviso && <div className="lobby-note">{aviso}</div>}

            <div className="auth-actions">
              <button className="btn primary" type="submit" disabled={!podeEnviar || enviando}>
                <span>{enviando ? 'AGUARDE...' : criando ? 'CRIAR' : 'ENTRAR'}</span>
              </button>
              <button className="btn ghost" type="button" onClick={trocarModo}>
                <span>{criando ? 'JÁ TENHO CONTA' : 'CRIAR CONTA'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="rr-control-bar">
        <div
          className="rr-control-hint"
          onClick={() => {
            uiSounds.play('back')
            onBack()
          }}
          style={{ cursor: 'pointer' }}
        >
          <div className="rr-key red" />
          <span className="rr-control-label">VOLTAR</span>
        </div>
      </div>
    </div>
  )
}
