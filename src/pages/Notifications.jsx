import './Notifications.css';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCourse } from '../lib/language';
import { ChevronLeft, Bell, Megaphone, ShieldAlert, MessageSquare, CheckCircle } from 'lucide-react';

const mockNotifications = (deckLevel) => [
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
    title: `New ${deckLevel} Deck Available`,
    message: `We just dropped the highly requested ${deckLevel} vocabulary deck. Head over to the Library to unlock it now.`,
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
  const course = useCourse();
  const [notifications, setNotifications] = useState(() => mockNotifications(course.copy.newDeckLevel));

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="ui-tool-page notifications-layout-1" >

      {/* Header */}
      <header data-tool-header="true" className="notifications-layout-2" >
        <button aria-label="Back" className="notifications-button-1" onClick={() => navigate('/profile')} >
          <ChevronLeft size={24} color="var(--color-text-navy)" strokeWidth={2.5} />
        </button>
        <h1 className="notifications-heading-1" >Notifications</h1>
      </header>

      <div className="notifications-layout-3" >

        {/* Main Hero Card */}
        <div className="notifications-panel-1" >
          {/* Decorative background element */}
          <div className="notifications-layout-4" >
            <Bell size={180} />
          </div>

          <div className="notifications-layout-5" >
            <div className="notifications-panel-2" >
              <Bell size={28} color="#FFFFFF" strokeWidth={2.5} />
            </div>

            <h2 className="notifications-heading-2" >
              {unreadCount} New
            </h2>
            <p className="notifications-copy-1" >
              Example updates & messages
            </p>

            {unreadCount > 0 && (
              <button className="notifications-button-2"
                onClick={markAllAsRead}

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
        <div className="notifications-layout-6" >
          {notifications.map((notification) => {
            const styles = getNotificationStyles(notification.type, notification.isRead);

            return (
              <button type="button" disabled={notification.isRead} aria-label={`${notification.isRead ? "Read:" : "Mark as read:"} ${notification.title}`} className="notifications-panel-3"
                key={notification.id}
                style={{ border: styles.border, opacity: styles.opacity }}
                onClick={() => {
                  setNotifications(notifications.map(n => n.id === notification.id ? { ...n, isRead: true } : n));
                }}
              >
                {!notification.isRead && (
                  <div className="notifications-panel-4" style={{ backgroundColor: styles.color }}></div>
                )}

                <div className="notifications-panel-5" style={{ backgroundColor: styles.bg, color: styles.color }}>
                  {styles.icon}
                </div>

                <div className="notifications-layout-7" >
                  <div className="notifications-layout-8" >
                    <span className="notifications-label-1" style={{ color: styles.color }}>
                      {notification.type}
                    </span>
                    <span className="notifications-label-2" >• {notification.timestamp}</span>
                  </div>
                  <h4 className="notifications-heading-3" >
                    {notification.title}
                  </h4>
                  <p className="notifications-copy-2" >
                    {notification.message}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
