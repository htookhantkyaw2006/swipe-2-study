import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Crown, Check, Minus, X, Sparkles, ShieldCheck } from 'lucide-react';

/* ---------------------------------------------------------------
   S2S PREMIUM — plans and comparison
   ---------------------------------------------------------------
   NOTHING HERE TAKES MONEY. There is no payment provider, no auth
   and no server, so the subscribe button opens an honest sheet
   instead of pretending to charge. Wire a real provider before this
   page goes anywhere near a user.

   PRICES ARE PLACEHOLDERS. Everything about them lives in CURRENCY
   and PLANS below — change those two and the whole page follows,
   including the savings badge, which is computed rather than typed
   so it cannot drift out of step with the numbers.
   --------------------------------------------------------------- */

const CURRENCY = { symbol: 'Ks', locale: 'en-US' };

const PLANS = [
  { id: 'year',    label: '12 months', months: 12, perMonth: 6900,  trialDays: 7 },
  { id: 'quarter', label: '3 months',  months: 3,  perMonth: 9900,  trialDays: 0 },
  { id: 'month',   label: '1 month',   months: 1,  perMonth: 12900, trialDays: 0 }
];

const BASELINE = PLANS[PLANS.length - 1].perMonth; // the monthly plan, for "save X%"

const money = (amount) => `${CURRENCY.symbol} ${amount.toLocaleString(CURRENCY.locale)}`;
const cadence = (months) => (months === 1 ? 'monthly' : months === 12 ? 'yearly' : `every ${months} months`);
const savingsPct = (plan) => Math.round((1 - plan.perMonth / BASELINE) * 100);

/* Only features that actually exist in the app today.
   Mock tests are deliberately absent — nothing in the codebase
   implements them, and a pricing page is a promise. */
const COMPARISON = [
  { feature: 'HSK 1 flashcards',        free: true,       premium: true },
  { feature: 'HSK 2–9 levels',          free: false,      premium: true },
  { feature: 'Dictionary & saved words', free: true,      premium: true },
  { feature: 'Daily review',            free: true,       premium: true },
  { feature: 'Cards per day',           free: '20',       premium: 'Unlimited' },
  { feature: 'Practise Writing',        free: 'HSK 1',    premium: 'All levels' },
  { feature: 'Spot the Radical drill',  free: false,      premium: true },
  { feature: 'Study by Interest',       free: false,      premium: true }
];

const GRADIENT = 'linear-gradient(135deg, #38BDF8 0%, #0369A1 100%)';

/* A comparison cell: tick, dash, or a short string. */
function Cell({ value, strong }) {
  if (value === true) {
    return <Check size={18} color={strong ? '#0369A1' : '#16A34A'} strokeWidth={3} />;
  }
  if (value === false) {
    return <Minus size={18} color="var(--color-border)" strokeWidth={3} />;
  }
  return (
    <span style={{
      fontSize: '0.8rem', fontWeight: 700,
      color: strong ? 'var(--color-primary-blue)' : 'var(--color-secondary-blue)'
    }}>
      {value}
    </span>
  );
}

/* Shown instead of a checkout, because there is no checkout. */
function NotConnectedSheet({ plan, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: 'rgba(12, 74, 110, 0.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface-card"
        style={{
          width: '100%', maxWidth: '520px', borderRadius: '28px 28px 0 0',
          padding: '24px', maxHeight: '80vh', overflowY: 'auto'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '16px', background: GRADIENT,
            boxShadow: '0 8px 16px rgba(3, 105, 161, 0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Crown size={24} color="#FFFFFF" strokeWidth={2.5} />
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={22} color="var(--color-secondary-blue)" />
          </button>
        </div>

        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>
          Payments are not connected yet
        </h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--color-secondary-blue)', fontWeight: 500 }}>
          This page is the subscription design, not a working checkout. S2S has no
          payment provider, no accounts and no server, so nothing can be charged and
          no plan can be activated.
        </p>

        <div style={{
          padding: '14px 16px', borderRadius: '16px',
          backgroundColor: 'var(--color-ghost-blue)', border: '1px solid var(--color-border)'
        }}>
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-secondary-blue)' }}>
            You selected
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>
            {plan.label} · {money(plan.perMonth)}/month
          </p>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: '16px', padding: '16px', borderRadius: '16px',
            border: 'none', cursor: 'pointer', background: GRADIENT,
            boxShadow: '0 8px 16px rgba(3, 105, 161, 0.3)',
            color: '#FFFFFF', fontWeight: 700, fontSize: '0.95rem'
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default function Premium() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(PLANS[0].id);
  const [sheetOpen, setSheetOpen] = useState(false);

  const plan = PLANS.find((p) => p.id === selected);

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', paddingBottom: '100px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header — same shape as Settings and the other subpages */}
      <header className="flex items-center justify-center relative">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          style={{ position: 'absolute', left: 0, background: 'transparent', padding: '8px', border: 'none', cursor: 'pointer', zIndex: 10 }}
        >
          <ChevronLeft size={24} color="var(--color-text-navy)" />
        </button>
        <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-text-navy)', fontWeight: 800 }}>
          S2S Premium
        </h1>
      </header>

      {/* Hero — echoes the promo card on Home so the two read as one thing */}
      <div style={{
        position: 'relative', borderRadius: '24px', overflow: 'hidden',
        background: GRADIENT, color: '#FFFFFF', padding: '28px 24px',
        boxShadow: '0 12px 32px rgba(3, 105, 161, 0.25)'
      }}>
        <div style={{ position: 'absolute', top: '-30px', left: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ position: 'absolute', bottom: '-50px', left: '45%', width: '140px', height: '140px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', right: '-16px', bottom: '-44px', fontSize: '9rem', fontWeight: 800, color: 'rgba(255,255,255,0.12)', lineHeight: 1, pointerEvents: 'none' }}>
          学
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(255,255,255,0.5)', padding: '4px 12px', borderRadius: '999px', marginBottom: '14px' }}>
            <Crown size={13} color="#E0F2FE" strokeWidth={3} />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#E0F2FE' }}>
              S2S Premium
            </span>
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 8px 0', lineHeight: 1.1, letterSpacing: '-0.5px' }}>
            All nine levels.<br />One subscription.
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#E0F2FE', margin: 0, lineHeight: 1.45, maxWidth: '300px' }}>
            11,000 words, every one explained in Burmese and English.
          </p>
        </div>
      </div>

      {/* Plans */}
      <div>
        <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-secondary-blue)', margin: '0 0 12px 0' }}>
          Choose a plan
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {PLANS.map((p) => {
            const active = p.id === selected;
            const save = savingsPct(p);
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                aria-pressed={active}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px', width: '100%', textAlign: 'left',
                  padding: '16px 18px', borderRadius: '18px', cursor: 'pointer',
                  border: active ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
                  backgroundColor: active ? 'var(--color-ghost-blue)' : 'var(--color-card-surface)',
                  transition: 'border-color 0.2s, background-color 0.2s'
                }}
              >
                {/* Radio */}
                <span style={{
                  flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%',
                  border: active ? 'none' : '2px solid var(--color-border)',
                  background: active ? GRADIENT : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {active && <Check size={13} color="#FFFFFF" strokeWidth={4} />}
                </span>

                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>
                      {p.label}
                    </span>
                    {p.trialDays > 0 && (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px',
                        color: '#15803D', backgroundColor: '#DCFCE7', padding: '3px 8px', borderRadius: '999px'
                      }}>
                        {p.trialDays} days free
                      </span>
                    )}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-secondary-blue)', fontWeight: 500, marginTop: '2px' }}>
                    {money(p.perMonth * p.months)} billed {cadence(p.months)}
                  </span>
                </span>

                <span style={{ flexShrink: 0, textAlign: 'right' }}>
                  {save > 0 && (
                    <span style={{
                      display: 'inline-block', marginBottom: '3px',
                      fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px',
                      color: 'var(--color-primary-blue)', backgroundColor: '#E0F2FE', padding: '3px 8px', borderRadius: '999px'
                    }}>
                      Save {save}%
                    </span>
                  )}
                  <span style={{ display: 'block', fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>
                    {money(p.perMonth)}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>
                    / month
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Comparison */}
      <div>
        <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-secondary-blue)', margin: '0 0 12px 0' }}>
          What you get
        </h3>

        <div className="surface-card" style={{ borderRadius: '20px', overflow: 'hidden' }}>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 72px 86px', alignItems: 'center',
            padding: '14px 18px', borderBottom: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-ghost-blue)'
          }}>
            <span />
            <span style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-secondary-blue)' }}>
              Free
            </span>
            <span style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-primary-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <Crown size={11} strokeWidth={3} /> Premium
            </span>
          </div>

          {COMPARISON.map((row, i) => (
            <div
              key={row.feature}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 72px 86px', alignItems: 'center',
                padding: '14px 18px',
                borderBottom: i === COMPARISON.length - 1 ? 'none' : '1px solid var(--color-ghost-blue)'
              }}
            >
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-navy)' }}>
                {row.feature}
              </span>
              <span style={{ display: 'flex', justifyContent: 'center' }}>
                <Cell value={row.free} />
              </span>
              <span style={{ display: 'flex', justifyContent: 'center' }}>
                <Cell value={row.premium} strong />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div>
        <button
          onClick={() => setSheetOpen(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '18px', borderRadius: '18px', border: 'none', cursor: 'pointer',
            background: GRADIENT, boxShadow: '0 10px 24px rgba(3, 105, 161, 0.3)',
            color: '#FFFFFF', fontWeight: 800, fontSize: '1rem',
            transition: 'transform 0.2s'
          }}
          onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <Sparkles size={18} strokeWidth={2.5} />
          {plan.trialDays > 0 ? `Start ${plan.trialDays}-day free trial` : `Subscribe · ${money(plan.perMonth)}/month`}
        </button>

        <p style={{ margin: '12px 0 0 0', fontSize: '0.75rem', lineHeight: 1.5, color: 'var(--color-secondary-blue)', textAlign: 'center', fontWeight: 500 }}>
          {plan.trialDays > 0
            ? `Free for ${plan.trialDays} days, then ${money(plan.perMonth * plan.months)} billed ${cadence(plan.months)}. `
            : `${money(plan.perMonth * plan.months)} billed ${cadence(plan.months)}. `}
          Cancel anytime.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '14px' }}>
          <ShieldCheck size={14} color="var(--color-secondary-blue)" strokeWidth={2.5} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-secondary-blue)' }}>
            Billing is not connected yet — nothing will be charged
          </span>
        </div>
      </div>

      {sheetOpen && <NotConnectedSheet plan={plan} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}
