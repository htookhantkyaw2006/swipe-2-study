import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bell, Megaphone, ShieldAlert, MessageSquare, CheckCircle } from 'lucide-react';

const mockNotifications = [
  {
    id: 1,
    type: 'OFFICIAL',
    title: 'S2S 2.0 is Here! 🚀',
    message: 'Welcome to the completely redesigned S2S app. Enjoy our new premium UI, enhanced swipe sessions, and brand new dictionary feature.',
    timestamp: '2 hours ago',
    isRead: false
  },
  {
    id: 2,
    type: 'RULES',
    title: 'Updated Community Guidelines',
    message: 'Please review our newly updated rules and regulations to ensure a safe and supportive learning environment for everyone.',
    timestamp: '1 day ago',
    isRead: false
  },
  {
    id: 3,
    type: 'MESSAGE',
    title: 'Daily Streak Milestone!',
    message: 'You just hit a 7-day study streak! Keep up the great work. Consistency is the key to fluency.',
    timestamp: '2 days ago',
    isRead: true
  },
  {
    id: 4,
    type: 'OFFICIAL',
    title: 'New HSK 4 Deck Available',
    message: 'We just dropped the highly requested HSK 4 vocabulary deck. Head over to the Library to unlock it now.',
    timestamp: '5 days ago',
    isRead: true
  }
];

const getNotificationStyles = (type, isRead) => {
  const baseOpacity = isRead ? 0.6 : 1;
  switch (type) {
    case 'OFFICIAL':
      return {
        icon: <Megaphone size={20} strokeWidth={2.5} />,
        bg: '#F3E8FF', color: '#9333EA', // Purple
        border: isRead ? '1px solid transparent' : '1px solid #E9D5FF',
        opacity: baseOpacity
      };
    case 'RULES':
      return {
        icon: <ShieldAlert size={20} strokeWidth={2.5} />,
        bg: '#FEF2F2', color: '#DC2626', // Red
        border: isRead ? '1px solid transparent' : '1px solid #FECACA',
        opacity: baseOpacity
      };
    case 'MESSAGE':
    default:
      return {
        icon: <MessageSquare size={20} strokeWidth={2.5} />,
        bg: '#E0F2FE', color: '#0284C7', // Blue
        border: isRead ? '1px solid transparent' : '1px solid #BAE6FD',
        opacity: baseOpacity
      };
  }
};

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(mockNotifications);

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FFFFFF', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ position: 'absolute', left: '24px', background: 'transparent', padding: 0, border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" strokeWidth={2.5} />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Notifications</h1>
      </header>

      <div style={{ padding: '0 24px' }}>
        
        {/* Main Hero Card */}
        <div style={{
          background: 'linear-gradient(135deg, #FDBA74 0%, #EA580C 100%)',
          borderRadius: '24px', padding: '24px', color: '#FFFFFF',
          boxShadow: '0 12px 24px rgba(234, 88, 12, 0.2)', marginBottom: '32px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          position: 'relative', overflow: 'hidden'
        }}>
          {/* Decorative background element */}
          <div style={{ position: 'absolute', right: '-10%', top: '-10%', fontSize: '10rem', color: '#FED7AA', opacity: 0.15, fontWeight: 900, zIndex: 0, pointerEvents: 'none' }}>
            <Bell size={180} />
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', backdropFilter: 'blur(8px)', margin: '0 auto 16px' }}>
              <Bell size={28} color="#FFFFFF" strokeWidth={2.5} />
            </div>
            
            <h2 style={{ fontSize: '2.5rem', fontWeight: 900, margin: '0 0 8px 0', lineHeight: 1, color: '#FFFFFF' }}>
              {unreadCount} New
            </h2>
            <p style={{ fontSize: '1rem', margin: '0 0 24px 0', opacity: 0.9 }}>
              Updates & Messages
            </p>
            
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#EA580C',
                  border: 'none',
                  borderRadius: '100px',
                  padding: '12px 24px',
                  fontSize: '0.875rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  transition: 'transform 0.2s',
                  margin: '0 auto'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <CheckCircle size={18} fill="currentColor" color="#FFFFFF" />
                Mark all as read
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
          {notifications.map((notification) => {
            const styles = getNotificationStyles(notification.type, notification.isRead);
            
            return (
              <div 
                key={notification.id}
                style={{ 
                  backgroundColor: '#FFFFFF', 
                  borderRadius: '20px', 
                  padding: '20px', 
                  display: 'flex', 
                  gap: '16px',
                  boxShadow: '0 4px 16px rgba(12, 74, 110, 0.04), 0 1px 3px rgba(12, 74, 110, 0.05)', 
                  position: 'relative',
                  border: styles.border,
                  opacity: styles.opacity,
                  transition: 'opacity 0.3s'
                }}
                onClick={() => {
                  setNotifications(notifications.map(n => n.id === notification.id ? { ...n, isRead: true } : n));
                }}
              >
                {!notification.isRead && (
                  <div style={{ position: 'absolute', top: '24px', right: '20px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: styles.color }}></div>
                )}
                
                <div style={{ 
                  width: '48px', height: '48px', borderRadius: '14px', 
                  backgroundColor: styles.bg, color: styles.color, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {styles.icon}
                </div>
                
                <div style={{ flex: 1, paddingRight: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: styles.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {notification.type}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>• {notification.timestamp}</span>
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 6px 0', lineHeight: 1.2 }}>
                    {notification.title}
                  </h4>
                  <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                    {notification.message}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
