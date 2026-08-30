import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Utensils, Plane, Users, Briefcase, Laptop, Heart, GraduationCap, ShoppingBag, House, Cloud, Dumbbell, Music, Film, Palette, Landmark, Sprout, Dog, Banknote, Shirt, Car, Calendar, Smile } from 'lucide-react';

export default function StudyByInterest() {
  const navigate = useNavigate();

  const categories = [
    { id: 'food', title: 'Food & Drinks', subtitle: 'Ordering, ingredients, dining out', icon: Utensils, gradientStart: '#FDBA74', gradientEnd: '#EA580C', shadow: 'rgba(234, 88, 12, 0.4)', char: '食' },
    { id: 'travel', title: 'Travel & Places', subtitle: 'Directions, transport, hotels', icon: Plane, gradientStart: '#7DD3FC', gradientEnd: '#0284C7', shadow: 'rgba(2, 132, 199, 0.4)', char: '游' },
    { id: 'people', title: 'People & Relationships', subtitle: 'Family, friends, feelings', icon: Users, gradientStart: '#FCA5A5', gradientEnd: '#DC2626', shadow: 'rgba(220, 38, 38, 0.4)', char: '人' },
    { id: 'work', title: 'Work & Business', subtitle: 'Meetings, emails, career', icon: Briefcase, gradientStart: '#D8B4FE', gradientEnd: '#9333EA', shadow: 'rgba(147, 51, 234, 0.4)', char: '业' },
    { id: 'tech', title: 'Technology', subtitle: 'Internet, devices, software', icon: Laptop, gradientStart: '#5EEAD4', gradientEnd: '#0F766E', shadow: 'rgba(15, 118, 110, 0.4)', char: '网' },
    { id: 'health', title: 'Health & Body', subtitle: 'Body parts, hospital, wellness', icon: Heart, gradientStart: '#86EFAC', gradientEnd: '#16A34A', shadow: 'rgba(22, 163, 74, 0.4)', char: '康' },
    { id: 'school', title: 'School & Study', subtitle: 'Classroom, exams, subjects', icon: GraduationCap, gradientStart: '#93C5FD', gradientEnd: '#1D4ED8', shadow: 'rgba(29, 78, 216, 0.4)', char: '学' },
    { id: 'shopping', title: 'Shopping', subtitle: 'Prices, bargaining, stores', icon: ShoppingBag, gradientStart: '#F9A8D4', gradientEnd: '#DB2777', shadow: 'rgba(219, 39, 119, 0.4)', char: '买' },
    { id: 'home', title: 'Home & Daily Life', subtitle: 'Rooms, chores, routines', icon: House, gradientStart: '#FDE68A', gradientEnd: '#D97706', shadow: 'rgba(217, 119, 6, 0.4)', char: '家' },
    { id: 'weather', title: 'Weather & Seasons', subtitle: 'Forecast, climate, months', icon: Cloud, gradientStart: '#A5F3FC', gradientEnd: '#0891B2', shadow: 'rgba(8, 145, 178, 0.4)', char: '天' },
    { id: 'sports', title: 'Sports & Fitness', subtitle: 'Games, gym, competitions', icon: Dumbbell, gradientStart: '#FDBA74', gradientEnd: '#C2410C', shadow: 'rgba(194, 65, 12, 0.4)', char: '动' },
    { id: 'music', title: 'Music & Arts', subtitle: 'Instruments, songs, concerts', icon: Music, gradientStart: '#C4B5FD', gradientEnd: '#6D28D9', shadow: 'rgba(109, 40, 217, 0.4)', char: '乐' },
    { id: 'entertainment', title: 'Movies & TV', subtitle: 'Films, shows, streaming', icon: Film, gradientStart: '#FDA4AF', gradientEnd: '#BE123C', shadow: 'rgba(190, 18, 60, 0.4)', char: '影' },
    { id: 'hobbies', title: 'Hobbies & Crafts', subtitle: 'Drawing, photography, making', icon: Palette, gradientStart: '#F0ABFC', gradientEnd: '#A21CAF', shadow: 'rgba(162, 28, 175, 0.4)', char: '趣' },
    { id: 'culture', title: 'Culture & History', subtitle: 'Festivals, traditions, museums', icon: Landmark, gradientStart: '#FCD34D', gradientEnd: '#B45309', shadow: 'rgba(180, 83, 9, 0.4)', char: '文' },
    { id: 'nature', title: 'Nature & Environment', subtitle: 'Plants, landscapes, ecology', icon: Sprout, gradientStart: '#BEF264', gradientEnd: '#4D7C0F', shadow: 'rgba(77, 124, 15, 0.4)', char: '自' },
    { id: 'animals', title: 'Animals & Pets', subtitle: 'Wildlife, pets, farm animals', icon: Dog, gradientStart: '#FCD9A6', gradientEnd: '#92400E', shadow: 'rgba(146, 64, 14, 0.4)', char: '物' },
    { id: 'money', title: 'Money & Finance', subtitle: 'Banking, payments, budgeting', icon: Banknote, gradientStart: '#6EE7B7', gradientEnd: '#047857', shadow: 'rgba(4, 120, 87, 0.4)', char: '钱' },
    { id: 'fashion', title: 'Clothing & Style', subtitle: 'Outfits, sizes, colors', icon: Shirt, gradientStart: '#A5B4FC', gradientEnd: '#4338CA', shadow: 'rgba(67, 56, 202, 0.4)', char: '衣' },
    { id: 'transport', title: 'Transport & Driving', subtitle: 'Cars, traffic, commuting', icon: Car, gradientStart: '#94A3B8', gradientEnd: '#334155', shadow: 'rgba(51, 65, 85, 0.4)', char: '车' },
    { id: 'time', title: 'Time & Numbers', subtitle: 'Dates, counting, schedules', icon: Calendar, gradientStart: '#7DD3FC', gradientEnd: '#1E40AF', shadow: 'rgba(30, 64, 175, 0.4)', char: '时' },
    { id: 'smalltalk', title: 'Small Talk', subtitle: 'Greetings, chit-chat, manners', icon: Smile, gradientStart: '#FDE047', gradientEnd: '#CA8A04', shadow: 'rgba(202, 138, 4, 0.4)', char: '聊' }
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header Container */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ padding: '24px 24px 16px 24px' }}>
          <header className="flex items-center justify-center relative" style={{ marginBottom: '32px' }}>
            <button 
              onClick={() => navigate(-1)} 
              style={{ position: 'absolute', left: 0, background: 'transparent', padding: '8px', border: 'none', cursor: 'pointer', zIndex: 10 }}
            >
              <ChevronLeft size={24} color="var(--color-text-navy)" />
            </button>
            <h1 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-text-navy)', fontWeight: 800 }}>Study by Interest</h1>
          </header>

          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '2rem', color: 'var(--color-text-navy)', margin: '0 0 8px 0', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              Learn what<br/>matters to you
            </h2>
            <p style={{ color: 'var(--color-secondary-blue)', fontSize: '1rem', margin: 0, fontWeight: 500 }}>
              Vocabulary grouped by real-life topics.
            </p>
          </div>

          {/* Categories Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px' }}>
            {categories.map((cat) => (
              <div 
                key={cat.id}
                className="surface-card"
                onClick={() => {
                  // In the future this can route to a specific interest session
                  // navigate(`/interest/${cat.id}`)
                }}
                style={{ 
                  padding: '20px 16px', borderRadius: '24px', cursor: 'pointer', 
                  display: 'flex', flexDirection: 'column', gap: '16px',
                  position: 'relative', overflow: 'hidden',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.06)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)';
                }}
              >
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '16px', background: `linear-gradient(135deg, ${cat.gradientStart} 0%, ${cat.gradientEnd} 100%)`, boxShadow: `0 8px 16px ${cat.shadow}` }}>
                  <cat.icon size={24} color="#FFFFFF" strokeWidth={2.5} />
                </div>
                
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 4px 0', lineHeight: 1.2 }}>
                    {cat.title}
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-secondary-blue)', margin: 0, fontWeight: 500, lineHeight: 1.3 }}>
                    {cat.subtitle}
                  </p>
                </div>

                {/* Faint background character */}
                <div style={{ 
                  position: 'absolute', right: '-10px', bottom: '-20px', 
                  fontSize: '5rem', color: 'var(--color-ghost-blue)', 
                  fontWeight: 800, opacity: 0.6, zIndex: 0, pointerEvents: 'none',
                  lineHeight: 1
                }}>
                  {cat.char}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
