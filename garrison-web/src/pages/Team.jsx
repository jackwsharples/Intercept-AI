import { motion } from 'framer-motion'
import { Mail, Linkedin, Shield, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1], delay },
})

export default function Team() {
  return (
    <div className="min-h-screen bg-garrison-bg flex flex-col">
      <header className="border-b border-garrison-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Shield className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-white text-lg tracking-tight">Garrison</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-lg w-full">
          <motion.div {...fadeUp(0)} className="text-center mb-12">
            <p className="text-indigo-400 text-xs font-semibold uppercase tracking-widest mb-3">
              The Team
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Built by engineers.<br />Focused on security.
            </h1>
            <p className="text-gray-400 text-[15px] leading-relaxed">
              We're a small, focused team building the security layer that every AI deployment needs.
            </p>
          </motion.div>

          <motion.div
            {...fadeUp(0.1)}
            className="bg-garrison-card border border-garrison-border rounded-2xl p-8 flex flex-col items-center text-center gap-6"
          >
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-xl shadow-indigo-500/25 text-2xl font-bold text-white select-none">
              JW
            </div>

            <div>
              <h2 className="text-white font-bold text-xl">Jack Sharples</h2>
              <p className="text-indigo-400 text-sm font-medium mt-1.5">
                Founder &amp; Lead Security Engineer
              </p>
              <p className="text-gray-500 text-sm mt-4 leading-relaxed max-w-sm mx-auto">
                Building Garrison to protect the next generation of AI deployments.
                Focused on making enterprise-grade AI security accessible to every SMB agency.
              </p>
            </div>

            <div className="flex gap-3 w-full pt-1">
              <a
                href="mailto:jack.w.sharples@gmail.com"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Mail className="w-4 h-4" />
                Email Me
              </a>
              <a
                href="https://www.linkedin.com/in/jack-w-sharples/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-garrison-border hover:border-indigo-500/50 text-gray-300 hover:text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Linkedin className="w-4 h-4 text-indigo-400" />
                LinkedIn
              </a>
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="border-t border-garrison-border px-6 py-6 text-center">
        <p className="text-gray-600 text-sm">© 2026 Garrison. Built for the agentic era.</p>
      </footer>
    </div>
  )
}
