import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, BrainCircuit, Check, ChevronDown, Clock3, Database, FileSearch, HeartPulse, LockKeyhole, MessageSquareText, ShieldCheck, Sparkles, Stethoscope } from 'lucide-react';
import { useState } from 'react';

const reveal = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .18 }, transition: { duration: .55, ease: 'easeOut' } };
const features = [
  ['Grounded answers', 'Answers are based on your hospital knowledge base, not guesswork.', FileSearch],
  ['Built for clinical flow', 'Move from patient questions to medication and inventory context in one focused space.', Stethoscope],
  ['Clear, structured outputs', 'Readable responses help teams scan the information that matters.', MessageSquareText],
];

function SectionTitle({ eyebrow, title, text }) { return <motion.div {...reveal} className="max-w-2xl"><p className="mn-eyebrow">{eyebrow}</p><h2 className="mn-title">{title}</h2>{text && <p className="mn-copy">{text}</p>}</motion.div>; }
function CTA() { return <section className="mn-cta-wrap"><motion.div {...reveal} className="mn-cta"><div><p className="mn-eyebrow">Ready when your team is</p><h2 className="text-3xl md:text-4xl font-bold tracking-tight mt-3">Ask better questions.<br />Find trusted context faster.</h2></div><Link to="/assistant" className="mn-button white">Open Assistant <ArrowRight size={17} /></Link></motion.div></section>; }

export function HomePage() {
  return <>
    <section className="mn-hero">
      <div className="mn-orb one" /><div className="mn-orb two" />
      <div className="mn-hero-grid">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6 }} className="relative z-10">
          <p className="mn-eyebrow"><Sparkles size={14} /> Hospital intelligence, made human</p>
          <h1>Clarity for every<br /><em>care decision.</em></h1>
          <p className="mn-lead">MediNexa connects your hospital knowledge with a focused AI assistant, so teams can find reliable context in moments.</p>
          <div className="flex flex-wrap gap-3"><Link to="/assistant" className="mn-button">Open Assistant <ArrowRight size={17} /></Link><Link to="/how-it-works" className="mn-button secondary">See how it works</Link></div>
          <div className="mn-trust"><span><Check size={15} /> Knowledge-base grounded</span><span><Check size={15} /> Designed for clinical teams</span></div>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .75, delay: .1 }} className="mn-visual">
          <div className="mn-ring ring-1" /><div className="mn-ring ring-2" />
          <div className="mn-ai-core"><BrainCircuit size={70} /><span>AI</span></div>
          <div className="mn-floating-card card-a"><HeartPulse size={20} /><div><b>Clinical context</b><small>Connected & ready</small></div><i /></div>
          <div className="mn-floating-card card-b"><Database size={19} /><div><b>Knowledge base</b><small>Structured sources</small></div></div>
          <div className="mn-scan-line" />
        </motion.div>
      </div>
    </section>
    <section className="mn-section stats"><motion.div {...reveal} className="mn-stat-grid"><Stat number="4" label="Knowledge domains" /><Stat number="24/7" label="Assistant availability" /><Stat number="1" label="Focused workspace" /><Stat number="∞" label="Questions explored" /></motion.div></section>
    <section className="mn-section"><SectionTitle eyebrow="Purpose-built intelligence" title="Hospital knowledge that meets you in the moment." text="MediNexa is designed to make the information already in your environment easier to reach, understand, and act on." /><div className="mn-feature-grid">{features.map(([title, text, Icon], i) => <motion.article {...reveal} transition={{ duration: .5, delay: i * .08 }} className="mn-feature" key={title}><span className="mn-icon"><Icon size={23} /></span><h3>{title}</h3><p>{text}</p><Link to="/about">Explore MediNexa <ArrowRight size={15} /></Link></motion.article>)}</div></section>
    <section className="mn-section mn-split"><motion.div {...reveal}><p className="mn-eyebrow">A calmer way to work</p><h2 className="mn-title">Designed around the questions care teams actually ask.</h2><p className="mn-copy">From a patient’s history to medication guidance, equipment records, and stock information—MediNexa keeps discovery simple and conversational.</p><Link to="/assistant" className="mn-text-link">Start a conversation <ArrowRight size={16} /></Link></motion.div><motion.div {...reveal} className="mn-query-panel"><span className="mn-query-dot" /><p>Ask MediNexa</p><div className="mn-query">“What should I know about Lisinopril?”</div><div className="mn-response"><Sparkles size={16} /> Searching trusted hospital context…<div className="mn-response-lines"><i /><i /><i /></div></div></motion.div></section>
    <CTA />
  </>;
}
function Stat({ number, label }) { return <div><strong>{number}</strong><span>{label}</span></div>; }

export function HowItWorksPage() { const steps = [['Ask naturally', 'Start with the clinical or operational question in front of you.', MessageSquareText], ['MediNexa retrieves', 'The assistant searches the relevant hospital knowledge domains.', FileSearch], ['Review with confidence', 'Receive a clear, structured response grounded in available sources.', ShieldCheck]]; return <><section className="mn-page-hero"><p className="mn-eyebrow">How it works</p><h1>Simple in the moment.<br /><em>Thoughtful underneath.</em></h1><p>One conversation turns a question into useful, source-grounded context.</p></section><section className="mn-section"><div className="mn-steps">{steps.map(([t, d, I], i) => <motion.article {...reveal} className="mn-step" key={t}><span>0{i + 1}</span><div className="mn-icon"><I size={23} /></div><h2>{t}</h2><p>{d}</p></motion.article>)}</div></section><CTA /></>; }

export function AboutPage() { return <><section className="mn-page-hero"><p className="mn-eyebrow">About the assistant</p><h1>Built to support<br /><em>clearer care.</em></h1><p>MediNexa is a hospital RAG assistant that makes internal knowledge more accessible without changing the systems your team already depends on.</p></section><section className="mn-section mn-about-grid"><motion.div {...reveal} className="mn-about-card"><LockKeyhole size={27} /><h2>Your knowledge stays central</h2><p>Responses are generated from the connected hospital knowledge base, helping the assistant stay relevant to your environment.</p></motion.div><motion.div {...reveal} className="mn-about-card"><Clock3 size={27} /><h2>Useful at the point of need</h2><p>Ask questions in plain language and get a focused starting point when time and attention are limited.</p></motion.div><motion.div {...reveal} className="mn-about-card"><HeartPulse size={27} /><h2>Made for people, not dashboards</h2><p>A conversational experience that keeps the workflow calm, clear, and easy to navigate.</p></motion.div></section><CTA /></>; }

const faqs = [['What is MediNexa?', 'MediNexa is an AI-powered hospital knowledge assistant that helps teams explore connected patient, medication, instrument, and inventory information.' ], ['Does MediNexa replace clinical judgment?', 'No. It is a knowledge-discovery tool. Clinical teams should continue to use professional judgment and established clinical processes.' ], ['Where do responses come from?', 'The assistant retrieves relevant context from the hospital knowledge base connected to this application.' ], ['What can I ask the Assistant?', 'You can ask about patients, medicines, instruments, and inventory in natural language.' ], ['Is the existing hospital data changed?', 'No. MediNexa enhances how you discover information; it does not change the connected backend, database, or existing records.' ]];
export function FAQsPage() { const [open, setOpen] = useState(0); return <><section className="mn-page-hero compact"><p className="mn-eyebrow">FAQs</p><h1>Questions, <em>answered.</em></h1><p>Everything you need to know before you start a conversation with MediNexa.</p></section><section className="mn-section mn-faq-list">{faqs.map(([q, a], i) => <motion.div {...reveal} className={open === i ? 'mn-faq open' : 'mn-faq'} key={q}><button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}><span>{q}</span><ChevronDown size={19} /></button>{open === i && <p>{a}</p>}</motion.div>)}</section><CTA /></>; }
