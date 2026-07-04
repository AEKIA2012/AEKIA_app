type AppLogoProps = {
  size?: 'sm' | 'md' | 'lg'
}

export default function AppLogo({ size = 'md' }: AppLogoProps) {
  const sizeClasses = {
    sm: 'h-12 w-12 rounded-2xl p-1',
    md: 'h-24 w-24 rounded-3xl p-2',
    lg: 'h-28 w-28 rounded-3xl p-2',
  }

  return (
    <div
      className={`flex items-center justify-center border border-cyan-400/50 bg-white shadow-xl shadow-cyan-500/20 ${sizeClasses[size]}`}
    >
      <img
        src="/logo-aekia.png"
        alt="Logo AEKIA"
        className="h-full w-full object-contain"
      />
    </div>
  )
}