import './globals.css'

export const metadata = {
  title: 'DigiResa Calendar',
  description: 'Système de réservation intelligent',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        padding: 0,
        fontFamily: '"Google Sans", -apple-system, BlinkMacSystemFont, sans-serif',
        backgroundColor: '#ffffff',
        overflowX: 'auto' // Allow horizontal scroll when needed
      }}>
        {children}
      </body>
    </html>
  )
}
