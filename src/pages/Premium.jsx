import './Premium.css';
import AppDialog from '../components/ui/AppDialog';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Crown, Check, Minus, X, Sparkles, ShieldCheck } from 'lucide-react';
import { useCourse } from '../lib/language';

/* ---------------------------------------------------------------
   S2S PREMIUM — plans and comparison
   ---------------------------------------------------------------
   NOTHING HERE TAKES MONEY. There is no payment provider, so
   the plan preview button opens an honest sheet
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

/* Only features that actually exist in the active course today.
   Mock tests are deliberately absent — nothing in the codebase
   implements them, and a pricing page is a promise. Rows for tools a
   course does not have (Japanese writing) are left out, not ticked. */
const comparisonFor = (course) => {
  const p = course.copy.premium;
  const has = (key) => course.exploreTools.some((t) => t.key === key && t.path);
  return [
    { feature: `${p.firstLevel} flashcards`, free: true, premium: true },
    { feature: p.laterLevels, free: false, premium: true },
    { feature: 'Dictionary & saved words', free: true, premium: true },
    { feature: 'Daily review', free: true, premium: true },
    { feature: 'Cards per day', free: '20', premium: 'Unlimited' },
    ...(has('kana') ? [{ feature: 'Learn Kana & quiz', free: true, premium: true }] : []),
    ...(has('sounds') ? [{ feature: 'Sounds of English & quiz', free: true, premium: true }] : []),
    ...(has('writing') ? [{ feature: 'Practise Writing', free: p.firstLevel, premium: 'All levels' }] : []),
    ...(has('radicals') ? [{ feature: `${course.radicals.copy.drillTitle} drill`, free: false, premium: true }] : []),
    { feature: 'Study by Interest', free: false, premium: true }
  ];
};

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
    <span className="premium-label-1" style={{ color: strong ? 'var(--color-primary-blue)' : 'var(--color-secondary-blue)' }}>
      {value}
    </span>
  );
}

/* Shown instead of a checkout, because there is no checkout. */
function NotConnectedSheet({ plan, onClose }) {
  return (
    <AppDialog label="Premium plans" onClose={onClose}>
      <div>
        <div className="premium-layout-1" >
          <div className="premium-panel-1" style={{ background: GRADIENT }}>
            <Crown size={24} color="#FFFFFF" strokeWidth={2.5} />
          </div>
          <button className="premium-button-1"
            onClick={onClose}
            aria-label="Close"

          >
            <X size={22} color="var(--color-secondary-blue)" />
          </button>
        </div>

        <h3 className="premium-heading-1" >
          Payments are not connected yet
        </h3>
        <p className="premium-copy-1" >
          Subscriptions are not available yet. You can explore the example plans here; no payment will be taken.
        </p>

        <div className="premium-panel-2" >
          <p className="premium-copy-2" >
            You selected
          </p>
          <p className="premium-copy-3" >
            {plan.label} · {money(plan.perMonth)}/month
          </p>
        </div>

        <button className="premium-button-2"
          onClick={onClose}
          style={{ background: GRADIENT }}
        >
          Got it
        </button>
      </div>
    </AppDialog>
  );
}

export default function Premium() {
  const navigate = useNavigate();
  const course = useCourse();
  const COMPARISON = comparisonFor(course);
  const [selected, setSelected] = useState(PLANS[0].id);
  const [sheetOpen, setSheetOpen] = useState(false);

  const plan = PLANS.find((p) => p.id === selected);

  return (
    <div className="ui-tool-page premium-layout-2" >

      {/* Header — same shape as Settings and the other subpages */}
      <header data-tool-header="true" className="flex items-center justify-center relative">
        <button className="premium-button-3"
          onClick={() => navigate('/profile')}
          aria-label="Back"

        >
          <ChevronLeft size={24} color="var(--color-text-navy)" />
        </button>
        <h1 className="premium-heading-2" >
          S2S Premium
        </h1>
      </header>

      {/* Hero — echoes the promo card on Home so the two read as one thing */}
      <div className="premium-panel-3" style={{ background: GRADIENT }}>
        <div className="premium-panel-4"  />
        <div className="premium-panel-5"  />
        <div className="premium-layout-3" >
          {course.copy.heroWatermark}
        </div>

        <div className="premium-layout-4" >
          <div className="premium-panel-6" >
            <Crown size={13} color="#E0F2FE" strokeWidth={3} />
            <span className="premium-label-2" >
              S2S Premium
            </span>
          </div>
          <h2 className="premium-heading-3" >
            {course.copy.premium.headline[0]}<br />{course.copy.premium.headline[1]}
          </h2>
          <p className="premium-copy-4" >
            {course.copy.premium.subhead}
          </p>
        </div>
      </div>

      {/* Plans */}
      <div>
        <h3 className="premium-heading-4" >
          Preview plans and pricing
        </h3>

        <div className="premium-layout-5" >
          {PLANS.map((p) => {
            const active = p.id === selected;
            const save = savingsPct(p);
            return (
              <button className="premium-button-4"
                key={p.id}
                onClick={() => setSelected(p.id)}
                aria-pressed={active}
                style={{ border: active ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-border)', backgroundColor: active ? 'var(--color-ghost-blue)' : 'var(--color-card-surface)' }}
              >
                {/* Radio */}
                <span className="premium-label-3" style={{ border: active ? 'none' : '2px solid var(--color-border)', background: active ? GRADIENT : 'transparent' }}>
                  {active && <Check size={13} color="#FFFFFF" strokeWidth={4} />}
                </span>

                <span className="premium-label-4" >
                  <span className="premium-label-5" >
                    <span className="premium-label-6" >
                      {p.label}
                    </span>
                    {p.trialDays > 0 && (
                      <span className="premium-label-7" >
                        {p.trialDays} days free
                      </span>
                    )}
                  </span>
                  <span className="premium-label-8" >
                    {money(p.perMonth * p.months)} billed {cadence(p.months)}
                  </span>
                </span>

                <span className="premium-label-9" >
                  {save > 0 && (
                    <span className="premium-label-10" >
                      Save {save}%
                    </span>
                  )}
                  <span className="premium-label-11" >
                    {money(p.perMonth)}
                  </span>
                  <span className="premium-label-12" >
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
        <h3 className="premium-heading-4" >
          What you get
        </h3>

        <div className="surface-card premium-panel-7" >
          {/* Column headers */}
          <div className="premium-grid-1" >
            <span />
            <span className="premium-label-13" >
              Free
            </span>
            <span className="premium-label-14" >
              <Crown size={11} strokeWidth={3} /> Premium
            </span>
          </div>

          {COMPARISON.map((row, i) => (
            <div className="premium-grid-2"
              key={row.feature}
              style={{ borderBottom: i === COMPARISON.length - 1 ? 'none' : '1px solid var(--color-ghost-blue)' }}
            >
              <span className="premium-label-15" >
                {row.feature}
              </span>
              <span className="premium-label-16" >
                <Cell value={row.free} />
              </span>
              <span className="premium-label-16" >
                <Cell value={row.premium} strong />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div>
        <button className="premium-button-5"
          onClick={() => setSheetOpen(true)}
          style={{ background: GRADIENT }}
          onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <Sparkles size={18} strokeWidth={2.5} />
          Preview selected plan
        </button>

        <p className="premium-copy-5" >
          Plans and prices are a preview. Subscriptions are not available yet.
        </p>

        <div className="premium-layout-6" >
          <ShieldCheck size={14} color="var(--color-secondary-blue)" strokeWidth={2.5} />
          <span className="premium-label-17" >
            Billing is not connected yet — nothing will be charged
          </span>
        </div>
      </div>

      {sheetOpen && <NotConnectedSheet plan={plan} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}
