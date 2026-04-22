/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc,
  getDocs,
  limit,
  setDoc,
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  Plus, 
  Search, 
  Clock, 
  Filter, 
  MoreVertical, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Image as ImageIcon,
  LogOut,
  Trash2,
  Calendar,
  User as UserIcon,
  Tag,
  ChevronRight,
  ChevronDown,
  BarChart3,
  BookOpen,
  Shield,
  LayoutDashboard,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO, startOfMonth, startOfWeek, startOfDay, subDays } from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { db, auth, signIn, signOut } from './firebase';
import { cn, formatSLA, transformGoogleDriveUrl } from './lib/utils';

interface Ticket {
  id: string;
  date: string;
  photo?: string;
  request: string;
  group: string;
  issue?: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  pic: string;
  rootCauses: string;
  solutions: string;
  slaMinutes: number;
  userId: string;
  createdAt: Timestamp;
}

interface Group {
  id: string;
  name: string;
}

interface PIC {
  id: string;
  name: string;
}

interface CaseStudy {
  id: string;
  caseNo: string;
  description: string;
  steps: string;
  notes: string;
  photos: string[];
  userId: string;
  createdAt: Timestamp;
}

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: 'Admin' | 'Editor' | 'Viewer';
  photoURL?: string;
  createdAt: Timestamp;
}

const Pagination = ({ 
  currentPage, 
  totalItems, 
  itemsPerPage, 
  onPageChange 
}: { 
  currentPage: number, 
  totalItems: number, 
  itemsPerPage: number, 
  onPageChange: (page: number) => void 
}) => {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-slate-100 mt-auto">
      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
        Showing <span className="text-slate-900">{Math.min(itemsPerPage * (currentPage - 1) + 1, totalItems)}</span> to <span className="text-slate-900">{Math.min(itemsPerPage * currentPage, totalItems)}</span> of <span className="text-slate-900">{totalItems}</span>
      </p>
      <div className="flex gap-2">
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          disabled={currentPage === 1}
          className="p-2 rounded-xl border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50 hover:border-indigo-200 transition-all shadow-sm active:bg-indigo-50"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
        </motion.button>
        <div className="flex items-center px-4 rounded-xl bg-slate-50 border border-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-widest">
          {currentPage} / {totalPages}
        </div>
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="p-2 rounded-xl border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50 hover:border-indigo-200 transition-all shadow-sm active:bg-indigo-50"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  );
};

const ReportsDashboard = ({ tickets }: { tickets: Ticket[] }) => {
  const [trendScale, setTrendScale] = useState<'Day' | 'Week' | 'Month'>('Month');

  // Process Trend Data based on scale
  const trendData = tickets.reduce((acc: any, t) => {
    try {
      const date = parseISO(t.date);
      let key = '';
      
      if (trendScale === 'Day') {
        key = format(date, 'dd MMM');
      } else if (trendScale === 'Week') {
        const start = startOfWeek(date, { weekStartsOn: 1 });
        key = `W${format(start, 'ww')} (${format(start, 'dd MMM')})`;
      } else {
        key = format(date, 'MMM yyyy');
      }
      
      acc[key] = (acc[key] || 0) + 1;
    } catch (e) {
      // Skip invalid dates
    }
    return acc;
  }, {});

  const chartTrend = Object.entries(trendData)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      // Custom sorting for trend data
      if (trendScale === 'Day') {
        const dateA = new Date(a.name + ' ' + new Date().getFullYear());
        const dateB = new Date(b.name + ' ' + new Date().getFullYear());
        return dateA.getTime() - dateB.getTime();
      } else if (trendScale === 'Week') {
        const weekA = parseInt(a.name.match(/W(\d+)/)?.[1] || '0');
        const weekB = parseInt(b.name.match(/W(\d+)/)?.[1] || '0');
        return weekA - weekB;
      } else {
        return new Date(a.name).getTime() - new Date(b.name).getTime();
      }
    });

  // Limit data points for better readability
  const displayTrend = trendScale === 'Day' ? chartTrend.slice(-30) : 
                       trendScale === 'Week' ? chartTrend.slice(-12) : 
                       chartTrend.slice(-12);

  // 2. Data by Group
  const groupData = tickets.reduce((acc: any, t) => {
    const groupName = t.group || 'Unassigned';
    acc[groupName] = (acc[groupName] || 0) + 1;
    return acc;
  }, {});

  const chartGroup = Object.entries(groupData).map(([name, value]) => ({ name, value }));

  // 3. Data by PIC
  const picData = tickets.reduce((acc: any, t) => {
    const picName = t.pic || 'Unassigned';
    acc[picName] = (acc[picName] || 0) + 1;
    return acc;
  }, {});

  const chartPic = Object.entries(picData).map(([name, count]) => ({ name, count }));

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Reporting Dashboard</h2>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-slate-200">
          Real-time Analytics
        </div>
      </div>

      {/* Volume Trend Chart */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm transition-hover hover:shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            Volume Trend ({trendScale})
          </h3>
          <div className="flex bg-slate-100 p-1 rounded-xl items-center">
            {(['Day', 'Week', 'Month'] as const).map((scale) => (
              <button
                key={scale}
                onClick={() => setTrendScale(scale)}
                className={cn(
                  "px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                  trendScale === scale 
                    ? "bg-white text-indigo-600 shadow-sm" 
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                {scale}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={displayTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                fontSize={10} 
                fontWeight="bold" 
                stroke="#94a3b8" 
                interval={trendScale === 'Day' ? 2 : 0}
              />
              <YAxis fontSize={10} fontWeight="bold" stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                cursor={{ fill: '#f8fafc' }}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={trendScale === 'Day' ? 12 : 30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Group Chart */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm transition-hover hover:shadow-md">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-500" />
            Distribution by Group
          </h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartGroup}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {chartGroup.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                />
                <Legend 
                  iconType="circle" 
                  layout="vertical" 
                  align="right" 
                  verticalAlign="middle"
                  wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingLeft: '20px' }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PIC Chart */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm transition-hover hover:shadow-md">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-indigo-500" />
            Productivity by PIC
          </h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartPic} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" fontSize={10} fontWeight="bold" stroke="#94a3b8" />
                <YAxis dataKey="name" type="category" fontSize={10} fontWeight="bold" stroke="#94a3b8" width={100} />
                <Tooltip 
                   contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                />
                <Bar dataKey="count" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const UsersDashboard = ({ 
  users, 
  currentUser 
}: { 
  users: UserProfile[], 
  currentUser: UserProfile | null 
}) => {
  if (currentUser?.role !== 'Admin') return null;

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      alert('Không thể cập nhật quyền người dùng');
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-black uppercase tracking-tight mb-6 flex items-center gap-2">
          <Shield className="w-6 h-6 text-indigo-600" />
          Quản lý người dùng & Phân quyền
        </h2>
        
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Người dùng</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Vai trò (Role)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-50">
              {users.map(u => (
                <tr key={u.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {u.photoURL ? (
                        <img src={u.photoURL} className="w-8 h-8 rounded-full border border-slate-200" alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-[10px] font-black text-indigo-600 uppercase">
                          {u.displayName[0]}
                        </div>
                      )}
                      <span className="font-bold text-slate-700 text-sm">{u.displayName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-500 text-sm">{u.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select 
                      disabled={u.id === currentUser.id}
                      className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer disabled:opacity-50"
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    >
                      <option value="Admin">Admin (Toàn quyền)</option>
                      <option value="Editor">Editor (Sửa/Xóa)</option>
                      <option value="Viewer">Viewer (Chỉ xem)</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pics, setPics] = useState<PIC[]>([]);
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);
  const [currentView, setCurrentView] = useState<'Dashboard' | 'Groups' | 'Pics' | 'Reports' | 'CaseStudies' | 'Users'>('Dashboard');
  
  const [showForm, setShowForm] = useState(false);
  const [showCaseStudyForm, setShowCaseStudyForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, type: 'tickets' | 'groups' | 'pics' | 'caseStudies' } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [caseSearchTerm, setCaseSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [ticketPage, setTicketPage] = useState(1);
  const [casePage, setCasePage] = useState(1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const itemsPerPage = 12;

  // Case Study Form State
  const [editingCaseStudy, setEditingCaseStudy] = useState<CaseStudy | null>(null);
  const [caseFormData, setCaseFormData] = useState({
    caseNo: '',
    description: '',
    steps: '',
    notes: '',
    photos: ['']
  });

  // Form State
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    request: '',
    group: '',
    status: 'Resolved' as const,
    pic: '',
    rootCauses: '',
    solutions: '',
    slaMinutes: 30,
    photo: ''
  });

  // Group/PIC Management States
  const [newGroupName, setNewGroupName] = useState('');
  const [newPicName, setNewPicName] = useState('');
  const [newPicGroupId, setNewPicGroupId] = useState('');

  // Reset pages on search/filter changes
  useEffect(() => { setTicketPage(1); }, [searchTerm, filterStatus]);
  useEffect(() => { setCasePage(1); }, [caseSearchTerm]);
  useEffect(() => { setTicketPage(1); setCasePage(1); }, [currentView]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          // Fetch or create user profile
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            setUserProfile({ id: userDoc.id, ...userDoc.data() } as UserProfile);
          } else {
            // Check if this is the first user
            let isFirstUser = false;
            try {
              const usersSnap = await getDocs(query(collection(db, 'users'), limit(1)));
              isFirstUser = usersSnap.empty;
            } catch (e) {
              console.warn("Could not check if first user, assuming not.", e);
            }

            const initialRole = (currentUser.email === 'dungdq1@gmail.com' || isFirstUser) ? 'Admin' : 'Viewer';
            
            const newProfile = {
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'Anonymous User',
              role: initialRole,
              photoURL: currentUser.photoURL || '',
              createdAt: serverTimestamp(),
              lastLogin: serverTimestamp(),
            };
            await setDoc(userDocRef, newProfile);
            setUserProfile({ id: currentUser.uid, ...newProfile } as any);
          }
        } catch (error) {
          console.error("Error setting up user profile:", error);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []); 

  useEffect(() => {
    if (!user) return;

    const unsubs: (() => void)[] = [];

    // Listen to personal profile always
    const unsubMe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data) {
          setUserProfile({ id: snapshot.id, ...data } as UserProfile);
        }
      }
    }, (error) => {
      // If we get permission denied here, it usually means the doc was deleted or rules are propagating
      if (error.code !== 'permission-denied') {
        console.error("Profile listen error:", error);
      }
    });
    unsubs.push(unsubMe);

    // Listen to all users ONLY IF admin
    if (userProfile?.role === 'Admin') {
      const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserProfile[];
        setAllUsers(usersList);
      }, (error) => {
        console.warn("User collection listen error (not an admin or rules pending):", error);
      });
      unsubs.push(unsubUsers);
    }

    const qTickets = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
    const unsubTickets = onSnapshot(qTickets, (snapshot) => {
      setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Ticket[]);
    }, (error) => console.error("Tickets listen error:", error));
    unsubs.push(unsubTickets);

    const unsubGroups = onSnapshot(collection(db, 'groups'), (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Group[]);
    }, (error) => console.error("Groups listen error:", error));
    unsubs.push(unsubGroups);

    const unsubPics = onSnapshot(collection(db, 'pics'), (snapshot) => {
      setPics(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PIC[]);
    }, (error) => console.error("Pics listen error:", error));
    unsubs.push(unsubPics);

    const unsubCaseStudies = onSnapshot(query(collection(db, 'caseStudies'), orderBy('createdAt', 'desc')), (snapshot) => {
      setCaseStudies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as CaseStudy[]);
    }, (error) => console.error("Case Studies listen error:", error));
    unsubs.push(unsubCaseStudies);

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [user, userProfile?.role]); // Re-run when role changes to enable admin-only listeners

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    await addDoc(collection(db, 'groups'), { name: newGroupName.trim(), createdAt: serverTimestamp() });
    setNewGroupName('');
  };

  const handleCreatePic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPicName.trim()) return;
    await addDoc(collection(db, 'pics'), { 
      name: newPicName.trim(), 
      createdAt: serverTimestamp() 
    });
    setNewPicName('');
  };

  const handleDeleteEntity = async (collectionName: 'groups' | 'pics' | 'caseStudies', id: string) => {
    setConfirmDelete({ id, type: collectionName });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, confirmDelete.type, confirmDelete.id));
      setConfirmDelete(null);
    } catch (error) {
      console.error('Delete failed', error);
      alert('Deletion failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setFormLoading(true);
      const cleanStr = (val: string) => val.trim().replace(/^"|"$/g, '').trim();

      // Check if Group/PIC exists and create if not
      const trimmedGroup = cleanStr(formData.group);
      const trimmedPic = cleanStr(formData.pic);

      if (trimmedGroup && !groups.some(g => g.name.toLowerCase() === trimmedGroup.toLowerCase())) {
        await addDoc(collection(db, 'groups'), { 
          name: trimmedGroup, 
          createdAt: serverTimestamp() 
        });
      }

      if (trimmedPic && !pics.some(p => p.name.toLowerCase() === trimmedPic.toLowerCase())) {
        await addDoc(collection(db, 'pics'), { 
          name: trimmedPic, 
          createdAt: serverTimestamp() 
        });
      }

      const ticketData = {
        ...formData,
        request: cleanStr(formData.request),
        group: trimmedGroup,
        pic: trimmedPic,
        rootCauses: cleanStr(formData.rootCauses),
        solutions: cleanStr(formData.solutions),
        photo: cleanStr(formData.photo),
        userId: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (editingTicket) {
        await updateDoc(doc(db, 'tickets', editingTicket.id), ticketData);
      } else {
        await addDoc(collection(db, 'tickets'), {
          ...ticketData,
          createdAt: serverTimestamp(),
        });
      }

      resetForm();
    } catch (error) {
      console.error('Error saving ticket', error);
      alert('Có lỗi xảy ra khi lưu ticket');
    } finally {
      setFormLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      request: '',
      group: '',
      status: 'Resolved',
      pic: '',
      rootCauses: '',
      solutions: '',
      slaMinutes: 30,
      photo: ''
    });
    setEditingTicket(null);
    setShowForm(false);
  };

  const handleSubmitCaseStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setFormLoading(true);
      const cleanStr = (val: string) => val.trim().replace(/^"|"$/g, '').trim();

      const caseStudyData = {
        caseNo: cleanStr(caseFormData.caseNo),
        description: cleanStr(caseFormData.description),
        steps: cleanStr(caseFormData.steps),
        notes: cleanStr(caseFormData.notes),
        photos: caseFormData.photos.filter(p => p.trim() !== '').map(p => cleanStr(p)),
        userId: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (editingCaseStudy) {
        await updateDoc(doc(db, 'caseStudies', editingCaseStudy.id), caseStudyData);
      } else {
        await addDoc(collection(db, 'caseStudies'), {
          ...caseStudyData,
          createdAt: serverTimestamp(),
        });
      }

      resetCaseStudyForm();
    } catch (error) {
      console.error('Error saving case study', error);
      alert('Có lỗi xảy ra khi lưu case study');
    } finally {
      setFormLoading(false);
    }
  };

  const generateNextCaseNo = () => {
    if (caseStudies.length === 0) return '001';
    
    // Extract numbers from all caseNo and find the max
    const numbers = caseStudies.map(cs => {
      const match = cs.caseNo.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    });
    
    const nextNum = Math.max(...numbers) + 1;
    return String(nextNum).padStart(3, '0');
  };

  const handleCasePhotoChange = (index: number, value: string) => {
    const transformed = transformGoogleDriveUrl(value);
    const newPhotos = [...caseFormData.photos];
    newPhotos[index] = transformed;
    
    // Auto-add new field if last one is filled and has content
    if (index === newPhotos.length - 1 && transformed.trim() !== '') {
      newPhotos.push('');
    }
    
    setCaseFormData({ ...caseFormData, photos: newPhotos });
  };

  const resetCaseStudyForm = () => {
    setCaseFormData({
      caseNo: generateNextCaseNo(),
      description: '',
      steps: '',
      notes: '',
      photos: ['']
    });
    setEditingCaseStudy(null);
    setShowCaseStudyForm(false);
  };

  const startEditCaseStudy = (cs: CaseStudy) => {
    setEditingCaseStudy(cs);
    setCaseFormData({
      caseNo: cs.caseNo,
      description: cs.description,
      steps: cs.steps,
      notes: cs.notes,
      photos: cs.photos && cs.photos.length > 0 ? [...cs.photos, ''] : ['']
    });
    setShowCaseStudyForm(true);
  };

  const startEdit = (ticket: Ticket) => {
    setEditingTicket(ticket);
    
    // Copy issue to solutions if it exists (legacy data migration on edit)
    let solutions = ticket.solutions || '';
    if (ticket.issue && !solutions.includes(ticket.issue)) {
      solutions = solutions ? `${solutions}\n\n[Issue Classification]: ${ticket.issue}` : `[Issue Classification]: ${ticket.issue}`;
    }

    setFormData({
      date: ticket.date,
      request: ticket.request,
      group: ticket.group,
      status: ticket.status,
      pic: ticket.pic,
      rootCauses: ticket.rootCauses,
      solutions: solutions,
      slaMinutes: ticket.slaMinutes,
      photo: ticket.photo || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    setConfirmDelete({ id, type: 'tickets' });
  };

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = t.request.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (t as any).issue?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.solutions?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.pic.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'All' || t.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const displayTickets = filteredTickets.slice(
    (ticketPage - 1) * itemsPerPage,
    ticketPage * itemsPerPage
  );

  const filteredCaseStudies = caseStudies.filter(cs => 
    cs.caseNo.toLowerCase().includes(caseSearchTerm.toLowerCase()) ||
    cs.description.toLowerCase().includes(caseSearchTerm.toLowerCase()) ||
    cs.steps.toLowerCase().includes(caseSearchTerm.toLowerCase()) ||
    cs.notes.toLowerCase().includes(caseSearchTerm.toLowerCase())
  );

  const displayCaseStudies = filteredCaseStudies.slice(
    (casePage - 1) * itemsPerPage,
    casePage * itemsPerPage
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen grid lg:grid-cols-2 bg-white">
        <div className="hidden lg:block relative bg-[#0F172A] overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_30%,#3B82F6_0,transparent_50%)]" />
            <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_80%_70%,#6366F1_0,transparent_50%)]" />
          </div>
          <div className="relative z-10 h-full flex flex-col justify-center p-20">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-bold text-white mb-6 tracking-tight leading-tight"
            >
              Theo dõi hỗ trợ vận hành <br />
              <span className="text-blue-500 text-3xl">Operations Support</span>
            </motion.h1>
            <p className="text-gray-400 text-xl max-w-md leading-relaxed">
              Hệ thống quản lý ticket chuyên nghiệp. Theo dõi yêu cầu, phân tích sự cố và đo lường hiệu suất SLA một cách hiệu quả.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-8 bg-gray-50">
          <div className="w-full max-w-sm">
            <div className="mb-12 text-center">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-200">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Chào mừng trở lại</h2>
              <p className="text-gray-500">Vui lòng đăng nhập để bắt đầu quản lý</p>
            </div>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={async () => {
                try {
                  await signIn();
                } catch (error: any) {
                  console.error('Login failed:', error);
                  if (error.code === 'auth/popup-blocked') {
                    alert('Trình duyệt đã chặn cửa sổ bật lên (popup). Vui lòng cho phép popup để đăng nhập.');
                  } else if (error.code === 'auth/auth-domain-config-required') {
                    alert('Lỗi cấu hình domain. Vui lòng kiểm tra cấu hình Auth Domain trong Firebase.');
                  } else {
                    alert('Đăng nhập thất bại: ' + (error.message || 'Lỗi không xác định'));
                  }
                }
              }}
              className="w-full h-14 bg-white border border-slate-200 rounded-2xl flex items-center justify-center gap-3 font-bold text-slate-700 hover:border-indigo-200 hover:bg-slate-50 transition-all shadow-sm hover:shadow-xl hover:shadow-indigo-500/10"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              <span>Đăng nhập với Google</span>
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-slate-100 overflow-hidden font-sans relative">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 bg-slate-900 text-white flex flex-col flex-shrink-0 z-50 transition-all duration-300 transform lg:translate-x-0 lg:static lg:inset-auto",
        isSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-slate-800 tracking-tight flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-indigo-400" />
            <div className="flex flex-col leading-none">
              <span className="text-sm font-black uppercase tracking-widest text-white">Operations</span>
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-tighter">Support Monitor</span>
            </div>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-2 text-sm text-slate-400">
          <div 
            onClick={() => {
              setCurrentView('Dashboard');
              setIsSidebarOpen(false);
            }}
            className={cn(
              "flex items-center space-x-3 p-3 rounded-xl cursor-pointer transition-all duration-300",
              currentView === 'Dashboard' 
                ? "bg-linear-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/30" 
                : "hover:bg-slate-800 hover:text-white text-slate-400 font-medium"
            )}
          >
            <LayoutDashboard className={cn("w-5 h-5 transition-transform group-hover:scale-110", currentView === 'Dashboard' ? "text-white" : "text-slate-500")} />
            <span className="font-bold">Dashboard</span>
          </div>
          <div 
            onClick={() => {
              setCurrentView('Groups');
              setIsSidebarOpen(false);
            }}
            className={cn(
              "flex items-center space-x-3 p-3 rounded-xl cursor-pointer transition-all duration-300",
              currentView === 'Groups' 
                ? "bg-linear-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/30" 
                : "hover:bg-slate-800 hover:text-white text-slate-400 font-medium"
            )}
          >
            <Filter className={cn("w-5 h-5", currentView === 'Groups' ? "text-white" : "text-slate-500")} />
            <span>Groups</span>
          </div>
          <div 
            onClick={() => {
              setCurrentView('Pics');
              setIsSidebarOpen(false);
            }}
            className={cn(
              "flex items-center space-x-3 p-3 rounded-xl cursor-pointer transition-all duration-300",
              currentView === 'Pics' 
                ? "bg-linear-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/30" 
                : "hover:bg-slate-800 hover:text-white text-slate-400 font-medium"
            )}
          >
            <UserIcon className={cn("w-5 h-5", currentView === 'Pics' ? "text-white" : "text-slate-500")} />
            <span>PICs</span>
          </div>
          <div 
            onClick={() => {
              setCurrentView('Reports');
              setIsSidebarOpen(false);
            }}
            className={cn(
              "flex items-center space-x-3 p-3 rounded-xl cursor-pointer transition-all duration-300",
              currentView === 'Reports' 
                ? "bg-linear-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/30" 
                : "hover:bg-slate-800 hover:text-white text-slate-400 font-medium"
            )}
          >
            <BarChart3 className={cn("w-5 h-5", currentView === 'Reports' ? "text-white" : "text-slate-500")} />
            <span>Reports</span>
          </div>
          <div 
            onClick={() => {
              setCurrentView('CaseStudies');
              setIsSidebarOpen(false);
            }}
            className={cn(
              "flex items-center space-x-3 p-3 rounded-xl cursor-pointer transition-all duration-300",
              currentView === 'CaseStudies' 
                ? "bg-linear-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/30" 
                : "hover:bg-slate-800 hover:text-white text-slate-400 font-medium"
            )}
          >
            <BookOpen className={cn("w-5 h-5", currentView === 'CaseStudies' ? "text-white" : "text-slate-500")} />
            <span>Case Studies</span>
          </div>

          {userProfile?.role === 'Admin' && (
            <div 
              onClick={() => {
                setCurrentView('Users');
                setIsSidebarOpen(false);
              }}
              className={cn(
                "flex items-center space-x-3 p-3 rounded-xl cursor-pointer transition-all duration-300",
                currentView === 'Users' 
                  ? "bg-linear-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/30" 
                  : "hover:bg-slate-800 hover:text-white text-slate-400 font-medium"
              )}
            >
              <Shield className={cn("w-5 h-5", currentView === 'Users' ? "text-white" : "text-slate-500")} />
              <span>User Mgmt</span>
            </div>
          )}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-xl mb-4">
             <img src={user.photoURL || ''} className="w-8 h-8 rounded-lg shadow-sm" alt={user.displayName || ''} />
             <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-bold text-white truncate">{user.displayName}</span>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-tighter",
                  userProfile?.role === 'Admin' ? "text-indigo-400" : 
                  userProfile?.role === 'Editor' ? "text-emerald-400" : "text-amber-400"
                )}>
                  {userProfile?.role || 'Viewer'}
                </span>
             </div>
             <button 
                onClick={signOut}
                className="ml-auto p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                title="Log Out"
             >
                <LogOut className="w-4 h-4" />
             </button>
          </div>
          <div className="text-[10px] text-slate-600 font-mono text-center">v2.4.0-production</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 relative">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shadow-sm flex-shrink-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative w-40 sm:w-64 md:w-96">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 leading-none">
              <Search className="w-4 h-4" />
            </span>
            {currentView === 'CaseStudies' ? (
              <input 
                type="text" 
                className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-md bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-400"
                placeholder="Search case studies by no, desc, or steps..."
                value={caseSearchTerm}
                onChange={(e) => setCaseSearchTerm(e.target.value)}
              />
            ) : (
              <input 
                type="text" 
                className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-md bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-400"
                placeholder="Search tickets by request, issue, or PIC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            )}
          </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {currentView === 'Dashboard' && (
              <div className="hidden sm:flex items-center gap-2 mr-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Filter:</span>
                <select 
                  className="text-xs font-bold bg-slate-100 border-none rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 cursor-pointer outline-none"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="All">All Status</option>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
            )}
            {currentView === 'CaseStudies' ? (
              userProfile?.role !== 'Viewer' && (
                <motion.button 
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    resetCaseStudyForm();
                    setShowCaseStudyForm(true);
                  }}
                  className="bg-linear-to-br from-indigo-600 to-blue-700 text-white px-6 py-2.5 rounded-2xl text-sm font-bold shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Case Study</span>
                </motion.button>
              )
            ) : (
              (currentView === 'Dashboard' || currentView === 'Groups' || currentView === 'Pics' || currentView === 'Reports') && userProfile?.role !== 'Viewer' && (
                <motion.button 
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                  className="bg-linear-to-br from-indigo-600 to-blue-700 text-white px-6 py-2.5 rounded-2xl text-sm font-bold shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Ticket</span>
                </motion.button>
              )
            )}
          </div>
        </header>

        <div className="p-8 flex-1 flex flex-col space-y-6 overflow-hidden sleek-scroll overflow-y-auto">
          {currentView === 'Dashboard' && (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm transition-hover hover:shadow-md">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Active Tickets</p>
                  <div className="flex items-end justify-between mt-2">
                    <p className="text-3xl font-black text-slate-900">{tickets.filter(t => t.status !== 'Closed').length}</p>
                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><Tag className="w-5 h-5 transition-transform group-hover:scale-110" /></div>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm transition-hover hover:shadow-md">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Critical SLA</p>
                  <div className="flex items-end justify-between mt-2">
                    <p className="text-3xl font-black text-red-600">{tickets.filter(t => t.slaMinutes > 120 && t.status !== 'Closed').length}</p>
                    <div className="p-2 bg-red-50 rounded-lg text-red-600"><Clock className="w-5 h-5" /></div>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm transition-hover hover:shadow-md">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Resolved (24h)</p>
                  <div className="flex items-end justify-between mt-2">
                    <p className="text-3xl font-black text-emerald-600">{tickets.filter(t => t.status === 'Resolved').length}</p>
                    <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><CheckCircle2 className="w-5 h-5" /></div>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm transition-hover hover:shadow-md">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Pending PIC</p>
                  <div className="flex items-end justify-between mt-2">
                    <p className="text-3xl font-black text-slate-900">{tickets.filter(t => !t.pic && t.status === 'Open').length}</p>
                    <div className="p-2 bg-slate-50 rounded-lg text-slate-600"><UserIcon className="w-5 h-5" /></div>
                  </div>
                </div>
              </div>

              {/* Ticket Table Card */}
              <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-[400px]">
                <div className="overflow-x-auto h-full sleek-scroll">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Request / Issue</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Group</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">PIC</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">SLA (Min)</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100 text-sm">
                      <AnimatePresence mode="popLayout">
                        {displayTickets.map((ticket) => (
                          <motion.tr 
                            key={ticket.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="group hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-medium">
                              {format(new Date(ticket.date), 'MMM dd, HH:mm')}
                            </td>
                            <td className="px-6 py-4 max-w-md">
                              <div className="flex items-center gap-3">
                                {ticket.photo ? (
                                  <img 
                                    src={ticket.photo} 
                                    className="w-10 h-10 rounded-lg object-cover shadow-sm flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity" 
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    onClick={() => setPreviewImage(ticket.photo!)}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/broken/40/40';
                                      (e.target as HTMLImageElement).className += ' grayscale opacity-50';
                                    }}
                                  />
                                ) : (
                                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 flex-shrink-0">
                                    <ImageIcon className="w-5 h-5" />
                                  </div>
                                )}
                                <div>
                                  <div className="font-bold text-slate-900 line-clamp-3 leading-tight mb-0.5">{ticket.request}</div>
                                  {ticket.solutions && (
                                    <div className="text-[10px] text-slate-400 line-clamp-1 italic leading-tight">{ticket.solutions}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider rounded-md">
                                {ticket.group}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center space-x-2">
                                <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-[10px] text-indigo-700 font-black">
                                  {ticket.pic ? ticket.pic.split(' ').map(n => n[0]).join('').toUpperCase() : '?'}
                                </div>
                                <span className={cn(ticket.pic ? "text-slate-800 font-medium" : "text-slate-300 italic")}>
                                  {ticket.pic || 'Unassigned'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-full leading-none inline-block",
                                ticket.status === 'Open' ? 'bg-indigo-100 text-indigo-700' :
                                ticket.status === 'In Progress' ? 'bg-amber-100 text-amber-700' :
                                ticket.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                              )}>
                                {ticket.status}
                              </span>
                            </td>
                            <td className={cn(
                              "px-6 py-4 font-mono font-bold text-xs",
                              ticket.slaMinutes > 120 ? "text-red-500" : ticket.slaMinutes > 60 ? "text-amber-500" : "text-slate-500"
                            )}>
                              {ticket.slaMinutes}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {(userProfile?.role === 'Admin' || userProfile?.role === 'Editor') && (
                                  <button 
                                    onClick={() => startEdit(ticket)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                )}
                                {userProfile?.role === 'Admin' && (
                                  <button 
                                    onClick={() => handleDelete(ticket.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                  
                  {filteredTickets.length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-300">
                      <AlertCircle className="w-12 h-12 mb-4 opacity-10" />
                      <p className="text-sm font-bold uppercase tracking-widest">No matching tickets found</p>
                    </div>
                  )}
                </div>
                <Pagination 
                  currentPage={ticketPage}
                  totalItems={filteredTickets.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setTicketPage}
                />
              </div>
            </>
          )}

          {currentView === 'CaseStudies' && (
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-[400px]">
              <div className="overflow-x-auto h-full sleek-scroll">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">Case No</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Steps</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Photos</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Notes</th>
                      <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100 text-sm">
                    <AnimatePresence mode="popLayout">
                      {displayCaseStudies.map((cs) => (
                        <motion.tr 
                          key={cs.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="group hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-indigo-600 font-bold font-mono">
                            {cs.caseNo}
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                             <div className="font-bold text-slate-800 line-clamp-3 leading-tight">{cs.description}</div>
                          </td>
                          <td className="px-6 py-4 max-w-md">
                             <div className="text-slate-600 text-xs whitespace-pre-wrap line-clamp-3 italic leading-tight">{cs.steps}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex -space-x-2 overflow-hidden">
                              {cs.photos && cs.photos.map((url, idx) => (
                                <img
                                  key={idx}
                                  src={url}
                                  className="inline-block h-8 w-8 rounded-full ring-2 ring-white object-cover cursor-zoom-in hover:z-10 transition-transform hover:scale-110"
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  onClick={() => setPreviewImage(url)}
                                />
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                             <div className="text-slate-500 text-xs italic line-clamp-3 leading-tight">{cs.notes}</div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {(userProfile?.role === 'Admin' || userProfile?.role === 'Editor') && (
                                <button 
                                  onClick={() => startEditCaseStudy(cs)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              )}
                              {userProfile?.role === 'Admin' && (
                                <button 
                                  onClick={() => handleDeleteEntity('caseStudies', cs.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
                
                {filteredCaseStudies.length === 0 && (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-300">
                    <BookOpen className="w-12 h-12 mb-4 opacity-10" />
                    <p className="text-sm font-bold uppercase tracking-widest">No matching case studies found</p>
                  </div>
                )}
              </div>
              <Pagination 
                currentPage={casePage}
                totalItems={filteredCaseStudies.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCasePage}
              />
            </div>
          )}

          {currentView === 'Groups' && (
            <div className="max-w-4xl mx-auto w-full space-y-6">
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-xl font-black uppercase tracking-tight mb-6 flex items-center gap-2">
                  <Filter className="w-6 h-6 text-indigo-600" />
                  Manage Groups
                </h2>
                {userProfile?.role === 'Admin' && (
                  <form onSubmit={handleCreateGroup} className="flex gap-4 mb-8">
                    <input 
                      type="text" 
                      placeholder="Enter new group name..."
                      className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                    />
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit" 
                      className="px-6 py-3 bg-linear-to-r from-indigo-600 to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Group</span>
                    </motion.button>
                  </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...groups].sort((a, b) => a.name.localeCompare(b.name)).map(group => (
                    <div key={group.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl group">
                      <span className="font-bold text-slate-700">{group.name}</span>
                      {userProfile?.role === 'Admin' && (
                        <button 
                          onClick={() => handleDeleteEntity('groups', group.id)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {groups.length === 0 && <p className="text-slate-400 text-sm italic col-span-2 text-center py-8">No groups defined yet.</p>}
                </div>
              </div>
            </div>
          )}

          {currentView === 'Pics' && (
            <div className="max-w-4xl mx-auto w-full space-y-6">
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-xl font-black uppercase tracking-tight mb-6 flex items-center gap-2">
                  <UserIcon className="w-6 h-6 text-indigo-600" />
                  Manage PICs
                </h2>
                {userProfile?.role === 'Admin' && (
                  <form onSubmit={handleCreatePic} className="flex gap-4 mb-8">
                    <input 
                      type="text" 
                      placeholder="Enter PIC Name..."
                      className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm"
                      value={newPicName}
                      onChange={(e) => setNewPicName(e.target.value)}
                    />
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit" 
                      className="px-6 py-3 bg-linear-to-r from-indigo-600 to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all flex items-center gap-2 justify-center"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add PIC</span>
                    </motion.button>
                  </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...pics].sort((a, b) => a.name.localeCompare(b.name)).map(pic => (
                    <div key={pic.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl group">
                      <div>
                        <div className="font-bold text-slate-700">{pic.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Independent PIC</div>
                      </div>
                      {userProfile?.role === 'Admin' && (
                        <button 
                          onClick={() => handleDeleteEntity('pics', pic.id)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {pics.length === 0 && <p className="text-slate-400 text-sm italic col-span-2 text-center py-8">No PICs defined yet.</p>}
                </div>
              </div>
            </div>
          )}

          {currentView === 'Reports' && (
            <ReportsDashboard tickets={tickets} />
          )}

          {currentView === 'Users' && userProfile?.role === 'Admin' && (
            <UsersDashboard users={allUsers} currentUser={userProfile} />
          )}
        </div>
      </main>

      {/* Ticket Modal - Styled for Sleek Theme */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetForm}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col flex-shrink"
            >
              <div className="px-8 py-6 bg-slate-900 text-white flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-600 rounded-lg">
                    <Plus className={cn("w-5 h-5 transition-transform", editingTicket && "rotate-45")} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">
                      {editingTicket ? 'Edit Case Ticket' : 'New Support Case'}
                    </h3>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Instance ID: {editingTicket?.id || 'AUTO_GEN'}</div>
                  </div>
                </div>
                <button 
                  onClick={resetForm}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Plus className="rotate-45 w-6 h-6 text-slate-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto sleek-scroll bg-white">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Submission Date & Time</label>
                    <input 
                      type="datetime-local" 
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-bold text-sm transition-all"
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Case Status</label>
                    <div className="relative">
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-bold text-sm appearance-none cursor-pointer transition-all"
                        value={formData.status}
                        onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                      >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Closed">Closed</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Project Request Details</label>
                  <textarea 
                    required
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-medium text-sm transition-all placeholder:text-slate-300"
                    placeholder="Describe the client request or incident..."
                    value={formData.request}
                    onChange={(e) => setFormData({...formData, request: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Functional Group</label>
                    <div className="relative">
                      <input 
                        required
                        list="group-list"
                        placeholder="Select or type new group..."
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-bold text-sm transition-all"
                        value={formData.group}
                        onChange={(e) => setFormData({...formData, group: e.target.value})}
                      />
                      <datalist id="group-list">
                        {[...groups].sort((a, b) => a.name.localeCompare(b.name)).map(g => (
                          <option key={g.id} value={g.name} />
                        ))}
                      </datalist>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Assigned PIC</label>
                    <div className="relative">
                      <input 
                        required
                        list="pic-list"
                        placeholder="Select or type new PIC..."
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-bold text-sm transition-all"
                        value={formData.pic}
                        onChange={(e) => setFormData({...formData, pic: e.target.value})}
                      />
                      <datalist id="pic-list">
                        {[...pics].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                          <option key={p.id} value={p.name} />
                        ))}
                      </datalist>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600 ml-1">Root Cause Analysis</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm"
                        value={formData.rootCauses}
                        onChange={(e) => setFormData({...formData, rootCauses: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600 ml-1">SLA Limit (Min)</label>
                      <input 
                        type="number" 
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm"
                        value={formData.slaMinutes}
                        onChange={(e) => setFormData({...formData, slaMinutes: parseInt(e.target.value) || 0})}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Solution Metadata</label>
                  <textarea 
                    rows={2}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-medium text-sm transition-all"
                    placeholder="Detail the steps taken to resolve..."
                    value={formData.solutions}
                    onChange={(e) => setFormData({...formData, solutions: e.target.value})}
                  />
                </div>

                {/* Photo URL Input & Preview */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Documentation Image (URL)</label>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input 
                        type="text" 
                        placeholder="Paste image URL or Google Drive link..."
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-medium text-sm transition-all placeholder:text-slate-300"
                        value={formData.photo}
                        onChange={(e) => setFormData({...formData, photo: transformGoogleDriveUrl(e.target.value)})}
                      />
                    </div>
                    {formData.photo && (
                      <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 relative group/img flex-shrink-0">
                        <img 
                          src={formData.photo} 
                          className="w-full h-full object-cover cursor-zoom-in" 
                          alt="Preview" 
                          referrerPolicy="no-referrer" 
                          onClick={() => setPreviewImage(formData.photo)}
                          onError={(e) => {
                            (e.target as HTMLImageElement).classList.add('opacity-10');
                          }}
                        />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                           <ImageIcon className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 flex gap-4 sticky bottom-0 bg-white z-10 pb-2">
                  <motion.button 
                    whileHover={{ scale: 1.02, backgroundColor: '#f8fafc' }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={resetForm}
                    className="flex-1 px-6 py-4 border border-slate-200 text-slate-500 font-bold rounded-2xl hover:border-slate-300 transition-all uppercase tracking-widest text-[10px]"
                  >
                    Discard Changes
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={formLoading}
                    className="flex-[2] px-6 py-4 bg-linear-to-br from-slate-800 to-slate-900 text-white font-bold rounded-2xl hover:from-indigo-600 hover:to-indigo-700 shadow-xl shadow-indigo-500/10 transition-all disabled:opacity-50 uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                  >
                    {formLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{editingTicket ? 'Update Case' : 'Initialize Ticket'}</span>
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Case Study Modal */}
      <AnimatePresence>
        {showCaseStudyForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetCaseStudyForm}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col flex-shrink"
            >
              <div className="px-8 py-6 bg-slate-900 text-white flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-600 rounded-lg">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">
                      {editingCaseStudy ? 'Edit Case Study' : 'New Case Study'}
                    </h3>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Knowledge Base Entry</div>
                  </div>
                </div>
                <button 
                  onClick={resetCaseStudyForm}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Plus className="rotate-45 w-6 h-6 text-slate-500" />
                </button>
              </div>

              <form onSubmit={handleSubmitCaseStudy} className="p-8 space-y-6 overflow-y-auto sleek-scroll bg-white">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Case No {editingCaseStudy && <span className="text-indigo-600 font-bold">(Editable)</span>}
                  </label>
                  <input 
                    type="text" 
                    required
                    readOnly={!editingCaseStudy}
                    placeholder="e.g., 001"
                    className={cn(
                      "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-bold text-sm transition-all",
                      !editingCaseStudy && "bg-slate-100 text-slate-500 cursor-not-allowed"
                    )}
                    value={caseFormData.caseNo}
                    onChange={(e) => setCaseFormData({...caseFormData, caseNo: e.target.value})}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Description</label>
                  <textarea 
                    required
                    rows={2}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-medium text-sm transition-all placeholder:text-slate-300"
                    placeholder="Briefly describe the case..."
                    value={caseFormData.description}
                    onChange={(e) => setCaseFormData({...caseFormData, description: e.target.value})}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Steps</label>
                  <textarea 
                    required
                    rows={6}
                    className="w-full px-4 py-3 font-mono bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-xs transition-all placeholder:text-slate-300"
                    placeholder="1. Step one&#10;2. Step two..."
                    value={caseFormData.steps}
                    onChange={(e) => setCaseFormData({...caseFormData, steps: e.target.value})}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Notes</label>
                  <textarea 
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-medium text-sm transition-all placeholder:text-slate-300 italic"
                    placeholder="Add special notes or warnings..."
                    value={caseFormData.notes}
                    onChange={(e) => setCaseFormData({...caseFormData, notes: e.target.value})}
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Documentation Images (URLs)</label>
                  <div className="space-y-3">
                    {caseFormData.photos.map((photo, index) => (
                      <div key={index} className="flex gap-3">
                        <div className="flex-1">
                          <input 
                            type="text" 
                            placeholder={`Paste image URL #${index + 1}...`}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-medium text-sm transition-all"
                            value={photo}
                            onChange={(e) => handleCasePhotoChange(index, e.target.value)}
                          />
                        </div>
                        {photo && (
                          <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 flex-shrink-0 relative group/caseimg">
                            <img 
                              src={photo} 
                              className="w-full h-full object-cover cursor-zoom-in" 
                              alt={`Preview ${index + 1}`} 
                              referrerPolicy="no-referrer" 
                              onClick={() => setPreviewImage(photo)}
                              onError={(e) => {
                                (e.target as HTMLImageElement).classList.add('opacity-10');
                              }}
                            />
                            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/caseimg:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <ImageIcon className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4 pt-4 sticky bottom-0 bg-white">
                  <motion.button 
                    whileHover={{ scale: 1.02, backgroundColor: '#f8fafc' }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={resetCaseStudyForm}
                    className="flex-1 px-4 py-4 border border-slate-200 text-slate-500 font-bold rounded-2xl hover:border-slate-300 transition-all text-xs uppercase tracking-widest"
                  >
                    Discard Changes
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={formLoading}
                    className="flex-[2] px-4 py-4 bg-linear-to-br from-indigo-600 to-blue-700 text-white font-bold rounded-2xl hover:shadow-indigo-500/40 transition-all text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2"
                  >
                    {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>{editingCaseStudy ? 'Update Case Study' : 'Save Case Study'}</span>
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDelete(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-slate-200"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-900 text-center mb-2 uppercase tracking-tight">Confirm Deletion</h3>
              <p className="text-slate-500 text-center text-sm mb-8 font-medium">
                Are you sure you want to delete this {confirmDelete.type === 'tickets' ? 'ticket' : confirmDelete.type === 'groups' ? 'group' : confirmDelete.type === 'caseStudies' ? 'Case Study' : 'PIC'}? 
                This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <motion.button 
                  whileHover={{ scale: 1.02, backgroundColor: '#f8fafc' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-3 border border-slate-200 text-slate-500 font-bold rounded-xl hover:border-slate-300 transition-all text-xs uppercase tracking-widest"
                >
                  Cancel
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleConfirmDelete}
                  className="flex-1 px-4 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all text-xs uppercase tracking-widest shadow-xl shadow-red-500/20 shadow-lg"
                >
                  Delete
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Lightbox */}
      <AnimatePresence>
        {previewImage && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewImage(null)}
              className="absolute inset-0 bg-slate-900/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative max-w-5xl w-full max-h-[85vh] flex items-center justify-center"
            >
              <img 
                src={previewImage} 
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" 
                alt="Full Preview"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={() => setPreviewImage(null)}
                className="absolute -top-12 right-0 p-2 text-white hover:text-indigo-400 transition-colors flex items-center gap-2 font-bold uppercase tracking-widest text-[10px]"
              >
                <span>Click anywhere to close</span>
                <Plus className="rotate-45 w-6 h-6" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
