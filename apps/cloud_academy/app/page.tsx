'use client'

import Image from 'next/image'
import BubbleChamber from '@/components/BubbleChamber'
import ReleaseVersion from '@/components/ReleaseVersion'

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', padding: '2rem' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <Image 
              src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/drz.webp`}
              alt="Doctor Z Logo" 
              width={80} 
              height={80}
              style={{ objectFit: 'contain', marginBottom: '0.5rem' }}
            />
            <h1 style={{ fontSize: '2.5rem', margin: 0, color: '#ffffff' }}>
              Cloud Academy
            </h1>
            <p className="byline">
              Por{" "}
              <a
                href="https://jorgezuluaga.github.io"
                target="_blank"
                rel="noreferrer"
              >
                Jorge I. Zuluaga
              </a>
            </p>
            <p className="host-line">
              Una app{" "}
              <a
                href="https://drz-academy.github.io/#apps"
                target="_blank"
                rel="noreferrer"
              >
                Dr.Z
              </a>
              {" / "}
              <a
                href="https://seap-udea.github.io/"
                target="_blank"
                rel="noreferrer"
              >
                seap-udea
              </a>
            </p>
          </div>
          <p style={{ fontSize: '1.1rem', color: '#b0b0b0', margin: '1rem 0' }}>
            Visualización interactiva de las trazas en una cámara de burbujas
          </p>
        </header>
        <BubbleChamber />
        <footer style={{ 
          marginTop: '2rem', 
          textAlign: 'center', 
          fontSize: '0.75rem', 
          color: '#666', 
          fontStyle: 'italic' 
        }}>
          Desarrollado en Cursor por Jorge I. Zuluaga, Doctor Z (2025)
          <br />
          <a 
            href="https://github.com/seap-udea/cloud_academy" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ 
              color: '#888', 
              textDecoration: 'none',
              marginLeft: '0.5rem',
              marginRight: '0.5rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#4dabf7'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
          >
            GitHub
          </a>
          <span style={{ color: '#555', marginLeft: '0.5rem', marginRight: '0.5rem' }}>|</span>
          <ReleaseVersion />
        </footer>
      </div>
    </main>
  )
}

