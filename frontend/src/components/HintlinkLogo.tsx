interface HintlinkLogoProps {
  className?: string
  size?: number
}

export function HintlinkLogo({ className = '', size = 32 }: HintlinkLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Haste Esquerda: Azul (#163A5F) em baixo, Amarelo (#F5B942) em cima */}
      <path
        d="M20 15 C20 45, 50 60, 50 60 C50 60, 80 75, 80 105"
        stroke="#F5B942"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* Haste Direita: Azul (#163A5F) */}
      <path
        d="M80 15 C80 45, 50 60, 50 60 C50 60, 20 75, 20 105"
        stroke="#163A5F"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Pontos de Conexão Superior */}
      <circle cx="20" cy="15" r="7" fill="#F7F9FC" stroke="#163A5F" strokeWidth="4" />
      <circle cx="80" cy="15" r="7" fill="#F7F9FC" stroke="#163A5F" strokeWidth="4" />

      {/* Pontos de Conexão Inferior */}
      <circle cx="20" cy="105" r="7" fill="#F7F9FC" stroke="#163A5F" strokeWidth="4" />
      <circle cx="80" cy="105" r="7" fill="#F7F9FC" stroke="#163A5F" strokeWidth="4" />
    </svg>
  )
}
