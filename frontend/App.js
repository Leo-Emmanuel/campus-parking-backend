import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
  Modal,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
// ===== UPDATED: Use Standard FileSystem API =====
// Using the standard expo-file-system API for better compatibility
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

import {
  Bell,
  Car,
  QrCode,
  Calendar,
  Users,
  MapPin,
  LogOut,
  Menu,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  Trash2,
  UserPlus,
  Wifi,
  WifiOff,
  Download,
  FileText,
} from 'lucide-react-native';

// ===== PUSH NOTIFICATION CONFIGURATION =====
// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ===== BACKEND API CONFIGURATION =====
// Cloud deployment URL (for production)
const API_BASE_URL = 'https://campus-parking-backend-1.onrender.com/api';
const WS_URL = 'wss://campus-parking-backend-1.onrender.com';

// Local development URL (uncomment for local testing)
// const API_BASE_URL = 'http://192.168.1.2:5000/api';
// const WS_URL = 'ws://192.168.1.2:5000';

// API helper functions
const api = {
  login: async (email, password, role) => {
    try {
      const payload = { email, password, role };
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      if (!data.success) throw new Error(data.message || 'Login failed');
      return data;
    } catch (error) {
      console.error('Login API error:', error);
      throw error;
    }
  },

  signup: async (userData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      if (!data.success) throw new Error(data.message || 'Signup failed');
      return data;
    } catch (error) {
      console.error('Signup API error:', error);
      throw error;
    }
  },

  getParkingZones: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/zones`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Get zones API error:', error);
      throw error;
    }
  },

  getBookings: async (userId, token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/bookings/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      return data;
    } catch (error) {
      console.error('Get bookings API error:', error);
      throw error;
    }
  },

  createBooking: async (bookingData, token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(bookingData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      if (!data.success) throw new Error(data.message || 'Booking failed');
      return data;
    } catch (error) {
      console.error('Create booking API error:', error);
      throw error;
    }
  },

  cancelBooking: async (bookingId, token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      if (!data.success) throw new Error(data.message || 'Cancellation failed');
      return data;
    } catch (error) {
      console.error('Cancel booking API error:', error);
      throw error;
    }
  },

  getNotifications: async (userId, token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/notifications/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      return data;
    } catch (error) {
      console.error('Get notifications API error:', error);
      throw error;
    }
  },

  getEvents: async (token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      return data;
    } catch (error) {
      console.error('Get events API error:', error);
      throw error;
    }
  },

  createEvent: async (eventData, token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(eventData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      if (!data.success) throw new Error(data.message || 'Event creation failed');
      return data;
    } catch (error) {
      console.error('Create event API error:', error);
      throw error;
    }
  },

  deleteEvent: async (eventId, token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      if (!data.success) throw new Error(data.message || 'Event deletion failed');
      return data;
    } catch (error) {
      console.error('Delete event API error:', error);
      throw error;
    }
  },

  createZone: async (zoneData, token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/zones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(zoneData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      if (!data.success) throw new Error(data.message || 'Zone creation failed');
      return data;
    } catch (error) {
      console.error('Create zone API error:', error);
      throw error;
    }
  },

  updateZone: async (zoneId, zoneData, token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/zones/${zoneId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(zoneData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      if (!data.success) throw new Error(data.message || 'Zone update failed');
      return data;
    } catch (error) {
      console.error('Update zone API error:', error);
      throw error;
    }
  },

  registerPushToken: async (userId, pushToken, token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/push-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pushToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      return data;
    } catch (error) {
      console.error('Register push token API error:', error);
      throw error;
    }
  },
};

const CampusParkingApp = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showMenu, setShowMenu] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [loading, setLoading] = useState(false);

  const wsRef = useRef(null);
  const [wsConnected, setWsConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  // Push notification refs
  const notificationListener = useRef();
  const responseListener = useRef();
  const [expoPushToken, setExpoPushToken] = useState('');

  const [loginForm, setLoginForm] = useState({ email: '', password: '', role: 'student' });
  const [signupForm, setSignupForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'student',
    phone: '',
    vehicleNumber: '',
  });
  const [bookingForm, setBookingForm] = useState({ zone: '', zoneId: '', date: '', duration: '2' });
  const [showQR, setShowQR] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [eventForm, setEventForm] = useState({
    name: '',
    date: '',
    allocatedSlots: '',
    zone: '',
    zoneId: null,
    description: '',
  });
  const [zoneForm, setZoneForm] = useState({
    id: '',
    name: '',
    total: '',
    type: 'general',
    location: '',
  });
  const [reportForm, setReportForm] = useState({
    startDate: '',
    endDate: '',
  });
  const [editMode, setEditMode] = useState(false);
  const [backendConnected, setBackendConnected] = useState(null);

  // Date picker states
  const [showBookingDatePicker, setShowBookingDatePicker] = useState(false);
  const [showEventDatePicker, setShowEventDatePicker] = useState(false);
  const [showReportStartDatePicker, setShowReportStartDatePicker] = useState(false);
  const [showReportEndDatePicker, setShowReportEndDatePicker] = useState(false);

  const [parkingZones, setParkingZones] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [events, setEvents] = useState([]);

  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        reconnectAttemptsRef.current = 0;
        try {
          ws.send(JSON.stringify({ type: 'subscribe', channel: 'parking_zones' }));
        } catch (sendError) {
          console.error('Error sending WebSocket message:', sendError);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setWsConnected(false);
        
        // Only reconnect if user is still logged in and we haven't exceeded attempts
        if (currentUser && reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(Math.pow(2, reconnectAttemptsRef.current) * 1000, 30000);
          setTimeout(() => {
            if (currentUser) {
              connectWebSocket();
            }
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsConnected(false);
        // Don't reset user state on WebSocket errors
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
      setWsConnected(false);
      // Don't reset user state on connection errors
    }
  };

  const disconnectWebSocket = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsConnected(false);
    reconnectAttemptsRef.current = 0;
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'zone_update':
        setParkingZones(prevZones => 
          prevZones.map(zone => 
            zone.id.toString() === data.zoneId.toString()
              ? { ...zone, available: data.available }
              : zone
          )
        );
        break;
      case 'zone_created':
        if (data.zone) {
          setParkingZones(prevZones => [...prevZones, data.zone]);
        }
        break;
      case 'zone_deleted':
        setParkingZones(prevZones => 
          prevZones.filter(zone => zone.id.toString() !== data.zoneId.toString())
        );
        break;
      case 'zones_update':
        if (data.zones) {
          setParkingZones(data.zones);
        }
        break;
      case 'booking_created':
        if (data.userId !== currentUser?.id) {
          addNotification({
            title: 'New Booking',
            message: `${data.zoneName} - Slot booked`,
            type: 'info',
            time: 'Just now'
          });
        }
        fetchParkingZones();
        break;
      case 'booking_cancelled':
        if (data.userId !== currentUser?.id) {
          addNotification({
            title: 'Slot Available',
            message: `${data.zoneName} - Slot freed`,
            type: 'success',
            time: 'Just now'
          });
        }
        fetchParkingZones();
        break;
      case 'notification':
        addNotification({
          title: data.title,
          message: data.message,
          type: data.notificationType || 'info',
          time: 'Just now'
        });
        break;
    }
  };

  const addNotification = (notification) => {
    setNotifications(prev => [{
      id: Date.now(),
      read: false,
      ...notification
    }, ...prev]);
  };

  // ===== PUSH NOTIFICATION FUNCTIONS =====
  const registerForPushNotificationsAsync = async () => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return null;
      }
      
      // Get push token - projectId is optional for development
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      
      console.log('Push token:', token);
      setExpoPushToken(token);
      
      // Register token with backend
      if (currentUser && authToken) {
        await api.registerPushToken(currentUser.id, token, authToken);
        console.log('Push token registered with backend');
      }
      
      return token;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  };

  useEffect(() => {
    if (currentUser) {
      connectWebSocket();
    } else {
      disconnectWebSocket();
    }
    return () => disconnectWebSocket();
  }, [currentUser]);

  useEffect(() => {
    fetchParkingZones();
    const interval = setInterval(() => {
      if (!wsConnected && currentUser) {
        fetchParkingZones();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [wsConnected, currentUser]);

  useEffect(() => {
    if (currentUser && authToken) {
      fetchUserData();
    }
  }, [currentUser, authToken]);

  // Setup push notifications when user logs in
  useEffect(() => {
    if (currentUser && authToken) {
      registerForPushNotificationsAsync();

      // Listen for notifications received while app is foregrounded
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        console.log('Notification received:', notification);
        const { title, body } = notification.request.content;
        addNotification({
          title: title || 'New Notification',
          message: body || '',
          type: 'info',
          time: 'Just now'
        });
      });

      // Listen for user interactions with notifications
      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification tapped:', response);
        const data = response.notification.request.content.data;
        
        // Navigate based on notification data
        if (data?.screen === 'bookings') {
          setActiveTab('bookings');
        } else if (data?.screen === 'notifications') {
          setActiveTab('notifications');
        }
      });

      return () => {
        if (notificationListener.current) {
          Notifications.removeNotificationSubscription(notificationListener.current);
        }
        if (responseListener.current) {
          Notifications.removeNotificationSubscription(responseListener.current);
        }
      };
    }
  }, [currentUser, authToken]);

  const fetchParkingZones = async () => {
    try {
      const data = await api.getParkingZones();
      setParkingZones(data);
      setBackendConnected(true);
    } catch (error) {
      console.error('Error fetching parking zones:', error);
      setBackendConnected(false);
      // Always show fallback data on network error, don't reset user state
      if (parkingZones.length === 0) {
        setParkingZones([
          { id: '1', name: 'Zone A - Main Campus', total: 50, available: 23, type: 'student', location: 'Main Building' },
          { id: '2', name: 'Zone B - Faculty Block', total: 30, available: 8, type: 'staff', location: 'Faculty Area' },
          { id: '3', name: 'Zone C - Library', total: 40, available: 15, type: 'general', location: 'Library Entrance' },
          { id: '4', name: 'Zone D - Visitor Parking', total: 20, available: 12, type: 'visitor', location: 'Main Gate' },
        ]);
      }
    }
  };

  const fetchUserData = async () => {
    if (!currentUser || !authToken) return;
    
    try {
      const bookingsData = await api.getBookings(currentUser.id, authToken);
      setBookings(bookingsData);
      
      const notificationsData = await api.getNotifications(currentUser.id, authToken);
      setNotifications(notificationsData);
      
      if (currentUser.role === 'admin') {
        const eventsData = await api.getEvents(authToken);
        setEvents(eventsData);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Don't reset user state on data fetch errors
      if (error.message && error.message.includes('401')) {
        console.warn('Authentication token may be expired');
        // Only logout on explicit auth errors, not network errors
      }
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const response = await api.login(loginForm.email, loginForm.password, loginForm.role);
      setCurrentUser(response.user);
      setAuthToken(response.token);
      setActiveTab('dashboard');
      Alert.alert('Success', `Welcome back, ${response.user.name}!`);
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Login Failed', error.message || 'Unable to connect to server. Please try again.');
      // Don't reset form on network errors to prevent navigation issues
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!signupForm.name || !signupForm.email || !signupForm.password) {
      Alert.alert('Error', 'Please fill all required fields (Name, Email, Password)');
      return;
    }
    if (signupForm.password !== signupForm.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (signupForm.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const response = await api.signup(signupForm);
      setCurrentUser(response.user);
      setAuthToken(response.token);
      setActiveTab('dashboard');
      Alert.alert('Success', 'Account created successfully!');
    } catch (error) {
      Alert.alert('Signup Failed', error.message || 'Unable to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Date validation and helper functions
  const validateDateFormat = (dateString) => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    return dateRegex.test(dateString);
  };

  const formatDateToString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateString = (dateString) => {
    if (!dateString) return new Date();
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Date picker handlers
  const handleBookingDateChange = (event, selectedDate) => {
    setShowBookingDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setBookingForm({ ...bookingForm, date: formatDateToString(selectedDate) });
    }
  };

  const handleEventDateChange = (event, selectedDate) => {
    setShowEventDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setEventForm({ ...eventForm, date: formatDateToString(selectedDate) });
    }
  };

  const handleReportStartDateChange = (event, selectedDate) => {
    setShowReportStartDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setReportForm({ ...reportForm, startDate: formatDateToString(selectedDate) });
    }
  };

  const handleReportEndDateChange = (event, selectedDate) => {
    setShowReportEndDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setReportForm({ ...reportForm, endDate: formatDateToString(selectedDate) });
    }
  };

  const handleBooking = async () => {
    if (!bookingForm.zone || !bookingForm.date) {
      Alert.alert('Error', 'Please select zone and date');
      return;
    }
    if (!validateDateFormat(bookingForm.date)) {
      Alert.alert('Error', 'Please enter date in YYYY-MM-DD format (e.g., 2025-10-15)');
      return;
    }
    const selectedDate = new Date(bookingForm.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(selectedDate.getTime())) {
      Alert.alert('Error', 'Invalid date format');
      return;
    }
    if (selectedDate < today) {
      Alert.alert('Error', 'Cannot book parking for past dates');
      return;
    }
    const duration = parseInt(bookingForm.duration);
    if (isNaN(duration) || duration < 1 || duration > 24) {
      Alert.alert('Error', 'Duration must be between 1 and 24 hours');
      return;
    }
    setLoading(true);
    try {
      const bookingData = {
        userId: currentUser.id,
        zoneId: bookingForm.zoneId,
        zoneName: bookingForm.zone,
        date: bookingForm.date,
        duration: duration,
        vehicleNumber: currentUser.vehicleNumber || '',
      };
      const response = await api.createBooking(bookingData, authToken);
      const newBooking = {
        id: response.booking.id,
        zone: bookingForm.zone,
        date: bookingForm.date,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        status: 'active',
        qrCode: response.booking.qrCode,
        duration: duration,
      };
      setBookings([newBooking, ...bookings]);
      setBookingForm({ zone: '', zoneId: '', date: '', duration: '2' });
      await fetchParkingZones();
      Alert.alert('Success', 'Booking confirmed! Check your bookings to view the QR code.');
      setActiveTab('bookings');
    } catch (error) {
      Alert.alert('Booking Failed', error.message || 'Unable to create booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (bookingId) => {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel this booking?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await api.cancelBooking(bookingId, authToken);
            setBookings(bookings.filter((b) => b.id !== bookingId));
            await fetchParkingZones();
            Alert.alert('Cancelled', 'Booking cancelled successfully');
          } catch (error) {
            Alert.alert('Cancellation Failed', error.message || 'Unable to cancel booking. Please try again.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const generateQRCode = (booking) => {
    setSelectedBooking(booking);
    setShowQR(true);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          setCurrentUser(null);
          setAuthToken(null);
          setActiveTab('dashboard');
          setShowMenu(false);
          setAuthMode('login');
          setBookings([]);
          setNotifications([]);
          setEvents([]);
          setLoginForm({ email: '', password: '', role: 'student' });
          Alert.alert('Success', 'Logged out successfully');
        },
      },
    ]);
  };

  const handleCreateEvent = async () => {
    if (!eventForm.name || !eventForm.date || !eventForm.allocatedSlots || !eventForm.zone) {
      Alert.alert('Error', 'Please fill all required fields (Name, Date, Allocated Slots, Zone)');
      return;
    }
    if (!validateDateFormat(eventForm.date)) {
      Alert.alert('Error', 'Please enter date in YYYY-MM-DD format (e.g., 2025-10-15)');
      return;
    }
    const slots = parseInt(eventForm.allocatedSlots);
    if (isNaN(slots) || slots < 0) {
      Alert.alert('Error', 'Allocated slots must be a valid positive number');
      return;
    }
    setLoading(true);
    try {
      const response = await api.createEvent({
        name: eventForm.name,
        date: eventForm.date,
        allocatedSlots: slots,
        zone: eventForm.zone,
        zoneId: eventForm.zoneId,
        description: eventForm.description,
      }, authToken);
      setEvents([...events, response.event]);
      setEventForm({ name: '', date: '', allocatedSlots: '', zone: '', zoneId: null, description: '' });
      setShowEventModal(false);
      Alert.alert('Success', 'Event created successfully!');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateZone = async () => {
    if (!zoneForm.name || !zoneForm.total) {
      Alert.alert('Error', 'Please fill all required fields (Name, Total Capacity)');
      return;
    }
    const total = parseInt(zoneForm.total);
    if (isNaN(total) || total < 1) {
      Alert.alert('Error', 'Total capacity must be at least 1');
      return;
    }
    setLoading(true);
    try {
      const zoneData = {
        name: zoneForm.name,
        total: total,
        type: zoneForm.type,
        location: zoneForm.location,
      };
      if (editMode) {
        await api.updateZone(zoneForm.id, zoneData, authToken);
      } else {
        await api.createZone(zoneData, authToken);
      }
      await fetchParkingZones();
      setZoneForm({ id: '', name: '', total: '', type: 'general', location: '' });
      setShowZoneModal(false);
      setEditMode(false);
      Alert.alert('Success', editMode ? 'Zone updated successfully!' : 'Zone created successfully!');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save zone. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditZone = (zone) => {
    setZoneForm({
      id: zone.id,
      name: zone.name,
      total: zone.total.toString(),
      type: zone.type,
      location: zone.location || '',
    });
    setEditMode(true);
    setShowZoneModal(true);
  };

  const handleDeleteEvent = async (eventId) => {
    Alert.alert('Delete Event', 'Are you sure you want to delete this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await api.deleteEvent(eventId, authToken);
            setEvents(events.filter(e => e.id !== eventId));
            Alert.alert('Success', 'Event deleted successfully');
          } catch (error) {
            Alert.alert('Error', error.message || 'Failed to delete event. Please try again.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  // ===== ENHANCED PDF DOWNLOAD WITH BETTER ERROR HANDLING =====
  const handleDownloadReport = async (reportType) => {
    const { startDate, endDate } = reportForm;
    
    console.log('=== PDF Download Started ===');
    console.log('Report Type:', reportType);
    console.log('Auth Token:', authToken ? 'Present' : 'Missing');
    
    if (!authToken) {
      Alert.alert('Error', 'Authentication required. Please log in again.');
      return;
    }

    if (startDate && !validateDateFormat(startDate)) {
      Alert.alert('Error', 'Start date must be in YYYY-MM-DD format');
      return;
    }
    if (endDate && !validateDateFormat(endDate)) {
      Alert.alert('Error', 'End date must be in YYYY-MM-DD format');
      return;
    }

    setLoading(true);
    try {
      let endpoint = '';
      switch (reportType) {
        case 'visitors':
          endpoint = `${API_BASE_URL}/admin/reports/visitors/pdf`;
          break;
        case 'events':
          endpoint = `${API_BASE_URL}/admin/reports/events/pdf`;
          break;
        case 'combined':
          endpoint = `${API_BASE_URL}/admin/reports/combined/pdf`;
          break;
        default:
          throw new Error('Invalid report type');
      }

      console.log('Download endpoint:', endpoint);

      // Check if running in Expo Go (limited file system access)
      const isExpoGo = !FileSystem.downloadDirectory && Platform.OS === 'android';
      
      if (isExpoGo) {
        console.log('Detected Expo Go - Using browser fallback');
        Alert.alert(
          'PDF Download',
          'Running in Expo Go has limited file system access. The PDF will open in your browser instead.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open in Browser',
              onPress: async () => {
                const pdfUrl = `${endpoint}?token=${authToken}`;
                const supported = await Linking.canOpenURL(pdfUrl);
                if (supported) {
                  await Linking.openURL(pdfUrl);
                } else {
                  Alert.alert('Error', 'Cannot open PDF URL');
                }
              }
            }
          ]
        );
        setLoading(false);
        return;
      }

      const timestamp = new Date().getTime();
      const fileName = `${reportType}_report_${timestamp}.pdf`;
      
      // Check available directories
      console.log('Platform:', Platform.OS);
      console.log('downloadDirectory available:', !!FileSystem.downloadDirectory);
      console.log('documentDirectory available:', !!FileSystem.documentDirectory);
      
      let directory;
      if (Platform.OS === 'android' && FileSystem.downloadDirectory) {
        directory = FileSystem.downloadDirectory;
        console.log('Using downloadDirectory:', directory);
      } else if (FileSystem.documentDirectory) {
        directory = FileSystem.documentDirectory;
        console.log('Using documentDirectory:', directory);
      } else {
        throw new Error('No accessible storage directory found. Please check app permissions.');
      }
      
      const fileUri = directory + fileName;
      console.log('Target file URI:', fileUri);
      
      // Ensure directory exists
      try {
        const dirInfo = await FileSystem.getInfoAsync(directory);
        console.log('Directory exists:', dirInfo.exists);
        if (!dirInfo.exists) {
          console.log('Creating directory...');
          await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        }
      } catch (dirError) {
        console.warn('Directory check failed:', dirError);
      }

      console.log('Starting download...');
      const downloadResumable = FileSystem.createDownloadResumable(
        endpoint,
        fileUri,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      const result = await downloadResumable.downloadAsync();
      console.log('Download result:', result);
      
      if (!result || !result.uri) {
        throw new Error('Download failed: No file URI returned');
      }
      
      const { uri } = result;
      console.log('Downloaded file URI:', uri);
      
      // Verify file exists
      const fileInfo = await FileSystem.getInfoAsync(uri);
      console.log('File info:', fileInfo);
      
      if (!fileInfo.exists) {
        throw new Error('Downloaded file not found');
      }
      
      const isSharingAvailable = await Sharing.isAvailableAsync();
      console.log('Sharing available:', isSharingAvailable);
      
      if (isSharingAvailable) {
        console.log('Opening share dialog...');
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or Share Report',
          UTI: 'com.adobe.pdf',
        });
      }
      
      const locationMsg = Platform.OS === 'android' && FileSystem.downloadDirectory 
        ? "Downloads folder" 
        : "app documents folder";
      
      Alert.alert(
        'Success! 📄',
        `Report downloaded to your device's ${locationMsg}.\n\nFile: ${fileName}\n\nYou can also share it from the share menu.`,
        [{ text: 'OK' }]
      );
      
      setShowReportModal(false);
      setReportForm({ startDate: '', endDate: '' });

    } catch (error) {
      console.error('=== PDF Download Error ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      let errorMessage = 'Failed to download report. Please try again.';
      let errorDetails = error.message || 'Unknown error';
      
      if (error.message?.includes('download directory') || error.message?.includes('storage')) {
        errorMessage = 'Storage access issue. Please check app permissions or try using a development build instead of Expo Go.';
      } else if (error.message?.includes('Network') || error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = 'Network connection failed. Please check your internet connection and ensure the backend server is running.';
      } else if (error.message?.includes('401') || error.message?.includes('403') || error.message?.includes('Unauthorized')) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (error.message?.includes('404')) {
        errorMessage = 'Report endpoint not found. Please ensure the backend server is running the latest version.';
      } else if (error.message?.includes('500')) {
        errorMessage = 'Server error occurred. Please try again later.';
      }
      
      Alert.alert(
        'Download Failed',
        `${errorMessage}\n\nDetails: ${errorDetails}`,
        [
          { text: 'OK' },
          { 
            text: 'Help', 
            onPress: () => Alert.alert(
              'Troubleshooting',
              '• Ensure backend server is running\n• Check internet connection\n• Verify you are logged in as admin\n• Try using a development build for full file system access\n• Check app storage permissions\n• Check console logs for detailed error'
            )
          }
        ]
      );
    } finally {
      setLoading(false);
      console.log('=== PDF Download Ended ===');
    }
  };

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#2563EB" />
        <ScrollView contentContainerStyle={styles.authContainer}>
          <View style={styles.authCard}>
            <View style={styles.logoContainer}>
              <View style={styles.logoCircle}>
                <Car color="#fff" size={40} />
              </View>
              <Text style={styles.title}>Campus Parking</Text>
              <Text style={styles.subtitle}>Smart Parking Management System</Text>
            </View>
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, authMode === 'login' && styles.tabActive]}
                onPress={() => setAuthMode('login')}
              >
                <Text style={[styles.tabText, authMode === 'login' && styles.tabTextActive]}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, authMode === 'signup' && styles.tabActive]}
                onPress={() => setAuthMode('signup')}
              >
                <Text style={[styles.tabText, authMode === 'signup' && styles.tabTextActive]}>Sign Up</Text>
              </TouchableOpacity>
            </View>
            {authMode === 'login' ? (
              <View>
                <Text style={styles.label}>Role</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={loginForm.role}
                    style={styles.pickerInner}
                    onValueChange={(value) => setLoginForm({ ...loginForm, role: value })}
                  >
                    <Picker.Item label="Student" value="student" />
                    <Picker.Item label="Staff" value="staff" />
                    <Picker.Item label="Admin" value="admin" />
                    <Picker.Item label="Visitor" value="visitor" />
                  </Picker>
                </View>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={loginForm.email}
                  onChangeText={(text) => setLoginForm({ ...loginForm, email: text })}
                  placeholder="your.email@campus.edu"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={loginForm.password}
                  onChangeText={(text) => setLoginForm({ ...loginForm, password: text })}
                  placeholder="••••••••"
                  secureTextEntry
                />
                <TouchableOpacity 
                  style={[styles.button, loading && styles.buttonDisabled]} 
                  onPress={handleLogin}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>{loading ? 'Signing In...' : 'Sign In'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.label}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  value={signupForm.name}
                  onChangeText={(text) => setSignupForm({ ...signupForm, name: text })}
                  placeholder="John Doe"
                />
                <Text style={styles.label}>Role *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={signupForm.role}
                    style={styles.pickerInner}
                    onValueChange={(value) => setSignupForm({ ...signupForm, role: value })}
                  >
                    <Picker.Item label="Student" value="student" />
                    <Picker.Item label="Staff" value="staff" />
                    <Picker.Item label="Visitor" value="visitor" />
                  </Picker>
                </View>
                <Text style={styles.label}>Email *</Text>
                <TextInput
                  style={styles.input}
                  value={signupForm.email}
                  onChangeText={(text) => setSignupForm({ ...signupForm, email: text })}
                  placeholder="your.email@campus.edu"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={styles.label}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={signupForm.phone}
                  onChangeText={(text) => setSignupForm({ ...signupForm, phone: text })}
                  placeholder="+91 98765 43210"
                  keyboardType="phone-pad"
                />
                <Text style={styles.label}>Vehicle Number</Text>
                <TextInput
                  style={styles.input}
                  value={signupForm.vehicleNumber}
                  onChangeText={(text) => setSignupForm({ ...signupForm, vehicleNumber: text.toUpperCase() })}
                  placeholder="KL-01-AB-1234"
                  autoCapitalize="characters"
                />
                <Text style={styles.label}>Password *</Text>
                <TextInput
                  style={styles.input}
                  value={signupForm.password}
                  onChangeText={(text) => setSignupForm({ ...signupForm, password: text })}
                  placeholder="Min 6 characters"
                  secureTextEntry
                />
                <Text style={styles.label}>Confirm Password *</Text>
                <TextInput
                  style={styles.input}
                  value={signupForm.confirmPassword}
                  onChangeText={(text) => setSignupForm({ ...signupForm, confirmPassword: text })}
                  placeholder="Re-enter password"
                  secureTextEntry
                />
                <TouchableOpacity 
                  style={[styles.button, loading && styles.buttonDisabled]} 
                  onPress={handleSignup}
                  disabled={loading}
                >
                  <UserPlus color="#fff" size={20} />
                  <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Account'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {backendConnected === false && (
              <Text style={styles.demoText}>
                ⚠️ Backend not connected - Using demo data
              </Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (showQR && selectedBooking) {
    return (
      <Modal visible={showQR} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Your Parking QR Code</Text>
            <View style={styles.qrContainer}>
              <QrCode size={200} color="#1F2937" />
              <Text style={styles.qrCode}>{selectedBooking.qrCode}</Text>
            </View>
            <View style={styles.qrDetails}>
              <Text style={styles.qrDetail}>
                <Text style={styles.qrLabel}>Zone:</Text> {selectedBooking.zone}
              </Text>
              <Text style={styles.qrDetail}>
                <Text style={styles.qrLabel}>Date:</Text> {selectedBooking.date}
              </Text>
              <Text style={styles.qrDetail}>
                <Text style={styles.qrLabel}>Time:</Text> {selectedBooking.time}
              </Text>
              <Text style={styles.qrDetail}>
                <Text style={styles.qrLabel}>Duration:</Text> {selectedBooking.duration} hours
              </Text>
              <Text style={styles.qrDetail}>
                <Text style={styles.qrLabel}>Status:</Text>{' '}
                <Text style={styles.qrStatus}>{selectedBooking.status}</Text>
              </Text>
            </View>
            <Text style={styles.qrNote}>📱 Scan this QR code at the entry and exit gates</Text>
            <TouchableOpacity style={styles.button} onPress={() => setShowQR(false)}>
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  if (showEventModal) {
    return (
      <Modal visible={showEventModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Create New Event</Text>
              <Text style={styles.label}>Event Name *</Text>
              <TextInput
                style={styles.input}
                value={eventForm.name}
                onChangeText={(text) => setEventForm({ ...eventForm, name: text })}
                placeholder="Tech Fest 2025"
              />
              <Text style={styles.label}>Date *</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowEventDatePicker(true)}
              >
                <Calendar color="#4F46E5" size={20} />
                <Text style={styles.datePickerText}>
                  {eventForm.date || 'Select Date'}
                </Text>
              </TouchableOpacity>
              {showEventDatePicker && (
                <DateTimePicker
                  value={eventForm.date ? parseDateString(eventForm.date) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleEventDateChange}
                  minimumDate={new Date()}
                />
              )}
              <Text style={styles.label}>Allocated Slots *</Text>
              <TextInput
                style={styles.input}
                value={eventForm.allocatedSlots}
                onChangeText={(text) => setEventForm({ ...eventForm, allocatedSlots: text })}
                keyboardType="numeric"
                placeholder="100"
              />
              <Text style={styles.label}>Zone *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={eventForm.zone}
                  style={styles.pickerInner}
                  onValueChange={(value) => {
                    const selectedZone = parkingZones.find(z => z.name === value);
                    setEventForm({ 
                      ...eventForm, 
                      zone: value,
                      zoneId: selectedZone ? selectedZone.id : null
                    });
                  }}
                >
                  <Picker.Item label="Select a zone..." value="" />
                  {parkingZones.map((zone) => (
                    <Picker.Item 
                      key={zone.id} 
                      label={`${zone.name} (${zone.available}/${zone.total} available)`} 
                      value={zone.name} 
                    />
                  ))}
                </Picker>
              </View>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={eventForm.description}
                onChangeText={(text) => setEventForm({ ...eventForm, description: text })}
                placeholder="Annual technology festival"
                multiline
                numberOfLines={3}
              />
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonHalf, styles.buttonSecondary]}
                  onPress={() => {
                    setShowEventModal(false);
                    setEventForm({ name: '', date: '', allocatedSlots: '', zone: '', zoneId: null, description: '' });
                  }}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.buttonHalf, loading && styles.buttonDisabled]}
                  onPress={handleCreateEvent}
                  disabled={loading}
                >
                  <UserPlus color="#fff" size={18} />
                  <Text style={styles.buttonTextSmall}>
                    {loading ? 'Creating...' : 'Create Event'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  if (showZoneModal) {
    return (
      <Modal visible={showZoneModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editMode ? 'Edit Parking Zone' : 'Create New Zone'}
              </Text>
              <Text style={styles.label}>Zone Name *</Text>
              <TextInput
                style={styles.input}
                value={zoneForm.name}
                onChangeText={(text) => setZoneForm({ ...zoneForm, name: text })}
                placeholder="Zone A - Main Campus"
              />
              <Text style={styles.label}>Total Capacity *</Text>
              <TextInput
                style={styles.input}
                value={zoneForm.total}
                onChangeText={(text) => setZoneForm({ ...zoneForm, total: text })}
                keyboardType="numeric"
                placeholder="50"
              />
              <Text style={styles.label}>Type *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={zoneForm.type}
                  style={styles.pickerInner}
                  onValueChange={(value) => setZoneForm({ ...zoneForm, type: value })}
                >
                  <Picker.Item label="General" value="general" />
                  <Picker.Item label="Student" value="student" />
                  <Picker.Item label="Staff" value="staff" />
                  <Picker.Item label="Visitor" value="visitor" />
                  <Picker.Item label="Event" value="event" />
                </Picker>
              </View>
              <Text style={styles.label}>Location</Text>
              <TextInput
                style={styles.input}
                value={zoneForm.location}
                onChangeText={(text) => setZoneForm({ ...zoneForm, location: text })}
                placeholder="Near Main Building"
              />
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonHalf, styles.buttonSecondary]}
                  onPress={() => {
                    setShowZoneModal(false);
                    setEditMode(false);
                    setZoneForm({ id: '', name: '', total: '', type: 'general', location: '' });
                  }}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.buttonHalf, loading && styles.buttonDisabled]}
                  onPress={handleUpdateZone}
                  disabled={loading}
                >
                  <Text style={styles.buttonTextSmall}>
                    {loading ? 'Saving...' : editMode ? 'Update Zone' : 'Create Zone'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  if (showReportModal) {
    return (
      <Modal visible={showReportModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Generate PDF Reports</Text>
              <Text style={styles.label}>Start Date (Optional)</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowReportStartDatePicker(true)}
              >
                <Calendar color="#4F46E5" size={20} />
                <Text style={styles.datePickerText}>
                  {reportForm.startDate || 'Select Start Date'}
                </Text>
              </TouchableOpacity>
              {showReportStartDatePicker && (
                <DateTimePicker
                  value={reportForm.startDate ? parseDateString(reportForm.startDate) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleReportStartDateChange}
                />
              )}
              <Text style={styles.label}>End Date (Optional)</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowReportEndDatePicker(true)}
              >
                <Calendar color="#4F46E5" size={20} />
                <Text style={styles.datePickerText}>
                  {reportForm.endDate || 'Select End Date'}
                </Text>
              </TouchableOpacity>
              {showReportEndDatePicker && (
                <DateTimePicker
                  value={reportForm.endDate ? parseDateString(reportForm.endDate) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleReportEndDateChange}
                  minimumDate={reportForm.startDate ? parseDateString(reportForm.startDate) : undefined}
                />
              )}
              <Text style={styles.reportNote}>
                💡 Leave dates empty to generate report for all records
              </Text>
              <TouchableOpacity
                style={[styles.button, styles.buttonSuccess, loading && styles.buttonDisabled]}
                onPress={() => handleDownloadReport('visitors')}
                disabled={loading}
              >
                <Download color="#fff" size={18} />
                <Text style={styles.buttonText}>
                  {loading ? 'Generating...' : 'Visitor Report'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPurple, loading && styles.buttonDisabled]}
                onPress={() => handleDownloadReport('events')}
                disabled={loading}
              >
                <Download color="#fff" size={18} />
                <Text style={styles.buttonText}>
                  {loading ? 'Generating...' : 'Event Report'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonInfo, loading && styles.buttonDisabled]}
                onPress={() => handleDownloadReport('combined')}
                disabled={loading}
              >
                <Download color="#fff" size={18} />
                <Text style={styles.buttonText}>
                  {loading ? 'Generating...' : 'Combined Report'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => {
                  setShowReportModal(false);
                  setReportForm({ startDate: '', endDate: '' });
                }}
              >
                <Text style={styles.buttonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2563EB" />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Car color="#fff" size={32} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Campus Parking</Text>
            <Text style={styles.headerSubtitle}>
              {currentUser.name} • {currentUser.role.toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {wsConnected ? (
            <View style={styles.wsConnected}>
              <Wifi color="#10B981" size={16} />
              <Text style={styles.wsText}>Live</Text>
            </View>
          ) : (
            <View style={styles.wsDisconnected}>
              <WifiOff color="#6B7280" size={16} />
            </View>
          )}
          {backendConnected === false && (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineText}>OFFLINE</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => setShowMenu(!showMenu)}>
            {showMenu ? <X color="#fff" size={24} /> : <Menu color="#fff" size={24} />}
          </TouchableOpacity>
        </View>
      </View>
      {showMenu && (
        <View style={styles.menu}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setActiveTab('dashboard');
              setShowMenu(false);
            }}
          >
            <MapPin size={20} color="#4B5563" />
            <Text style={styles.menuText}>Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setActiveTab('book');
              setShowMenu(false);
            }}
          >
            <Calendar size={20} color="#4B5563" />
            <Text style={styles.menuText}>Book Slot</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setActiveTab('bookings');
              setShowMenu(false);
            }}
          >
            <Clock size={20} color="#4B5563" />
            <Text style={styles.menuText}>My Bookings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setActiveTab('notifications');
              setShowMenu(false);
            }}
          >
            <Bell size={20} color="#4B5563" />
            <Text style={styles.menuText}>Notifications</Text>
            {notifications.filter(n => !n.read).length > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {notifications.filter(n => !n.read).length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          {currentUser.role === 'admin' && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setActiveTab('events');
                setShowMenu(false);
              }}
            >
              <Users size={20} color="#4B5563" />
              <Text style={styles.menuText}>Event Management</Text>
            </TouchableOpacity>
          )}
          {currentUser.role === 'admin' && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setActiveTab('zones');
                setShowMenu(false);
              }}
            >
              <MapPin size={20} color="#4B5563" />
              <Text style={styles.menuText}>Manage Zones</Text>
            </TouchableOpacity>
          )}
          {currentUser.role === 'admin' && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowReportModal(true);
                setShowMenu(false);
              }}
            >
              <FileText size={20} color="#4B5563" />
              <Text style={styles.menuText}>PDF Reports</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLogout]} onPress={handleLogout}>
            <LogOut size={20} color="#DC2626" />
            <Text style={styles.menuTextLogout}>Logout</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView style={styles.content}>
        {activeTab === 'dashboard' && (
          <View>
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>Parking Zones</Text>
              {wsConnected && (
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Real-time updates</Text>
                </View>
              )}
            </View>
            {parkingZones.length === 0 ? (
              <View style={styles.emptyState}>
                <MapPin color="#9CA3AF" size={48} />
                <Text style={styles.emptyText}>Loading parking zones...</Text>
              </View>
            ) : (
              parkingZones.map((zone) => (
                <View key={zone.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>{zone.name}</Text>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{zone.type}</Text>
                      </View>
                    </View>
                    <MapPin color="#2563EB" size={24} />
                  </View>
                  <View style={styles.cardContent}>
                    <View style={styles.availabilityRow}>
                      <Text style={styles.availabilityLabel}>Available</Text>
                      <Text style={[
                        styles.availabilityValue,
                        zone.available === 0 && styles.availabilityZero
                      ]}>
                        {zone.available}/{zone.total}
                      </Text>
                    </View>
                    <View style={styles.progressBar}>
                      <View style={[
                        styles.progressFill, 
                        { width: `${(zone.available / zone.total) * 100}%` },
                        zone.available === 0 && styles.progressEmpty
                      ]} />
                    </View>
                    {zone.available === 0 && (
                      <Text style={styles.fullText}>🚫 Fully Booked</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
        {activeTab === 'book' && (
          <View>
            <Text style={styles.pageTitle}>Book Parking Slot</Text>
            <View style={styles.card}>
              <Text style={styles.label}>Select Zone</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={bookingForm.zone}
                  style={styles.pickerInner}
                  onValueChange={(value) => {
                    const selectedZone = parkingZones.find(z => z.name === value);
                    setBookingForm({ 
                      ...bookingForm, 
                      zone: value,
                      zoneId: selectedZone?.id || '' 
                    });
                  }}
                >
                  <Picker.Item label="Choose a zone..." value="" />
                  {parkingZones
                    .filter((z) => z.available > 0)
                    .map((zone) => (
                      <Picker.Item 
                        key={zone.id}
                        label={`${zone.name} (${zone.available} available)`} 
                        value={zone.name} 
                      />
                    ))}
                </Picker>
              </View>
              <Text style={styles.label}>Date</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowBookingDatePicker(true)}
              >
                <Calendar color="#4F46E5" size={20} />
                <Text style={styles.datePickerText}>
                  {bookingForm.date || 'Select Date'}
                </Text>
              </TouchableOpacity>
              {showBookingDatePicker && (
                <DateTimePicker
                  value={bookingForm.date ? parseDateString(bookingForm.date) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleBookingDateChange}
                  minimumDate={new Date()}
                />
              )}
              <Text style={styles.label}>Duration (hours)</Text>
              <TextInput
                style={styles.input}
                value={bookingForm.duration}
                onChangeText={(text) => setBookingForm({ ...bookingForm, duration: text })}
                keyboardType="numeric"
                placeholder="2"
              />
              <TouchableOpacity 
                style={[styles.button, loading && styles.buttonDisabled]} 
                onPress={handleBooking}
                disabled={loading}
              >
                <Calendar color="#fff" size={20} />
                <Text style={styles.buttonText}>
                  {loading ? 'Booking...' : 'Confirm Booking'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {activeTab === 'bookings' && (
          <View>
            <Text style={styles.pageTitle}>My Bookings</Text>
            {bookings.length === 0 ? (
              <View style={styles.emptyState}>
                <Clock color="#9CA3AF" size={48} />
                <Text style={styles.emptyText}>No bookings yet</Text>
                <TouchableOpacity 
                  style={styles.button}
                  onPress={() => setActiveTab('book')}
                >
                  <Calendar color="#fff" size={20} />
                  <Text style={styles.buttonText}>Book a Slot</Text>
                </TouchableOpacity>
              </View>
            ) : (
              bookings.map((booking) => (
                <View key={booking.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>{booking.zone}</Text>
                      <Text style={styles.cardSubtitle}>
                        {booking.date} • {booking.time}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, booking.status === 'active' ? styles.statusActive : styles.statusCompleted]}>
                      <Text style={styles.statusText}>{booking.status}</Text>
                    </View>
                  </View>
                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={[styles.button, styles.buttonHalf]} onPress={() => generateQRCode(booking)}>
                      <QrCode color="#fff" size={18} />
                      <Text style={styles.buttonTextSmall}>Show QR</Text>
                    </TouchableOpacity>
                    {booking.status === 'active' && (
                      <TouchableOpacity
                        style={[styles.button, styles.buttonHalf, styles.buttonDanger]}
                        onPress={() => cancelBooking(booking.id)}
                      >
                        <Trash2 color="#fff" size={18} />
                        <Text style={styles.buttonTextSmall}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
        {activeTab === 'notifications' && (
          <View>
            <Text style={styles.pageTitle}>Notifications</Text>
            {notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Bell color="#9CA3AF" size={48} />
                <Text style={styles.emptyText}>No notifications</Text>
              </View>
            ) : (
              notifications.map((notif) => (
                <View key={notif.id} style={styles.notificationCard}>
                  <View
                    style={[
                      styles.notificationIcon,
                      notif.type === 'success'
                        ? styles.notificationSuccess
                        : notif.type === 'warning'
                        ? styles.notificationWarning
                        : styles.notificationInfo,
                    ]}
                  >
                    {notif.type === 'success' ? (
                      <CheckCircle color="#059669" size={20} />
                    ) : notif.type === 'warning' ? (
                      <AlertCircle color="#D97706" size={20} />
                    ) : (
                      <Bell color="#2563EB" size={20} />
                    )}
                  </View>
                  <View style={styles.notificationContent}>
                    <Text style={styles.notificationTitle}>{notif.title}</Text>
                    <Text style={styles.notificationMessage}>{notif.message}</Text>
                    <Text style={styles.notificationTime}>{notif.time}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
        {activeTab === 'events' && currentUser.role === 'admin' && (
          <View>
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>Event Parking Management</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => {
                  setEventForm({ name: '', date: '', allocatedSlots: '', zone: '', zoneId: null, description: '' });
                  setShowEventModal(true);
                }}
              >
                <UserPlus color="#fff" size={20} />
                <Text style={styles.addButtonText}>Add Event</Text>
              </TouchableOpacity>
            </View>
            {events.length === 0 ? (
              <View style={styles.emptyState}>
                <Users color="#9CA3AF" size={48} />
                <Text style={styles.emptyText}>No events scheduled</Text>
              </View>
            ) : (
              events.map((event) => (
                <View key={event.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>{event.name}</Text>
                      <Text style={styles.cardSubtitle}>
                        {event.date} • {event.zone}
                      </Text>
                    </View>
                    <Users color="#9333EA" size={24} />
                  </View>
                  <View style={styles.cardContent}>
                    <View style={styles.availabilityRow}>
                      <Text style={styles.availabilityLabel}>Allocated Slots</Text>
                      <Text style={[styles.availabilityValue, { color: '#9333EA' }]}>{event.allocatedSlots}</Text>
                    </View>
                    {event.description && (
                      <Text style={styles.eventDescription}>{event.description}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.button, styles.buttonDanger]}
                    onPress={() => handleDeleteEvent(event.id)}
                  >
                    <Trash2 color="#fff" size={18} />
                    <Text style={styles.buttonText}>Delete Event</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}
        {activeTab === 'zones' && currentUser.role === 'admin' && (
          <View>
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>Manage Parking Zones</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => {
                  setZoneForm({ id: '', name: '', total: '', type: 'general', location: '' });
                  setEditMode(false);
                  setShowZoneModal(true);
                }}
              >
                <UserPlus color="#fff" size={20} />
                <Text style={styles.addButtonText}>Add Zone</Text>
              </TouchableOpacity>
            </View>
            {parkingZones.length === 0 ? (
              <View style={styles.emptyState}>
                <MapPin color="#9CA3AF" size={48} />
                <Text style={styles.emptyText}>No zones configured</Text>
              </View>
            ) : (
              parkingZones.map((zone) => (
                <View key={zone.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>{zone.name}</Text>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{zone.type}</Text>
                      </View>
                    </View>
                    <MapPin color="#2563EB" size={24} />
                  </View>
                  <View style={styles.cardContent}>
                    <View style={styles.availabilityRow}>
                      <Text style={styles.availabilityLabel}>Total Capacity</Text>
                      <Text style={styles.availabilityValue}>{zone.total} spots</Text>
                    </View>
                    <View style={styles.availabilityRow}>
                      <Text style={styles.availabilityLabel}>Currently Available</Text>
                      <Text style={[
                        styles.availabilityValue,
                        zone.available === 0 && styles.availabilityZero
                      ]}>
                        {zone.available} spots
                      </Text>
                    </View>
                    {zone.location && (
                      <Text style={styles.zoneLocation}>📍 {zone.location}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.button, styles.buttonPurple]}
                    onPress={() => handleEditZone(zone)}
                  >
                    <Text style={styles.buttonText}>Edit Zone</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  authContainer: {
    flexGrow: 1,
    padding: 16,
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  authCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#2563EB',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#fff',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
    height: 50,
    color: '#000',
    ...Platform.select({
      android: {
        paddingHorizontal: 12,
        textAlignVertical: 'center',
      },
    }),
  },
  picker: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#fff',
    height: 50,
    marginBottom: 16,
    ...Platform.select({
      android: {
        color: '#000',
      },
    }),
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        height: 50,
        justifyContent: 'center',
      },
      android: {
        height: 50,
      },
    }),
  },
  pickerInner: {
    ...Platform.select({
      ios: {
        height: 50,
      },
      android: {
        color: '#000',
        height: 50,
      },
    }),
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    marginBottom: 16,
    height: 50,
    gap: 10,
  },
  datePickerText: {
    fontSize: 16,
    color: '#374151',
    flex: 1,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    backgroundColor: '#93C5FD',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonTextSmall: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  demoText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#DC2626',
    marginTop: 16,
    fontWeight: '500',
  },
  header: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#DBEAFE',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wsConnected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  wsDisconnected: {
    padding: 4,
  },
  wsText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: 'bold',
  },
  offlineBadge: {
    backgroundColor: '#FCD34D',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  offlineText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#92400E',
  },
  menu: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#374151',
  },
  menuItemLogout: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
  },
  menuTextLogout: {
    marginLeft: 12,
    fontSize: 16,
    color: '#DC2626',
    fontWeight: '600',
  },
  notificationBadge: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 'auto',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  liveText: {
    color: '#065F46',
    fontSize: 11,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    color: '#1E40AF',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  cardContent: {
    marginTop: 8,
  },
  availabilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  availabilityLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  availabilityValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
  availabilityZero: {
    color: '#DC2626',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressEmpty: {
    backgroundColor: '#DC2626',
  },
  fullText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    marginTop: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusActive: {
    backgroundColor: '#D1FAE5',
  },
  statusCompleted: {
    backgroundColor: '#E5E7EB',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
    textTransform: 'uppercase',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  buttonHalf: {
    flex: 1,
    marginTop: 0,
  },
  buttonDanger: {
    backgroundColor: '#DC2626',
  },
  buttonPurple: {
    backgroundColor: '#9333EA',
  },
  buttonSecondary: {
    backgroundColor: '#6B7280',
  },
  buttonSuccess: {
    backgroundColor: '#10B981',
  },
  buttonInfo: {
    backgroundColor: '#0EA5E9',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 12,
    marginBottom: 24,
  },
  notificationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationSuccess: {
    backgroundColor: '#D1FAE5',
  },
  notificationWarning: {
    backgroundColor: '#FEF3C7',
  },
  notificationInfo: {
    backgroundColor: '#DBEAFE',
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 16,
  },
  qrContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  qrCode: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#6B7280',
    marginTop: 16,
    textAlign: 'center',
  },
  qrDetails: {
    marginBottom: 16,
  },
  qrDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  qrLabel: {
    fontWeight: 'bold',
    color: '#1F2937',
  },
  qrStatus: {
    color: '#10B981',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  qrNote: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  addButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  eventDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    fontStyle: 'italic',
  },
  zoneLocation: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  reportNote: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
});

export default CampusParkingApp;