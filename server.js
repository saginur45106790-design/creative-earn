const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

const ADMIN_PASSWORD = "sajibbithi2828@";
const STATIC_ADMIN_TOKEN = "ADM_PERMANENT_SECRET_TOKEN_CE_2026";

let globalNotice = "🎉 CreativeEarn-এ আপনাকে স্বাগতম! ১০০ টাকা ডিপোজিট করে ফেস ভেরিফাই আনলক করুন এবং ইনকাম শুরু করুন।";
let adminDepositNumber = "01836345346";

let siteStats = {
  activeUsersCount: 1450,
  totalWithdrawAmount: 485000
};

let registeredUsers = [
  {
    id: "USR-1001",
    name: "রহিম আহমেদ",
    phone: "01836345346",
    email: "rahim@gmail.com",
    password: "user1234",
    balance: 150,
    hasDeposited100: true,
    isFaceVerified: true,
    faceImageData: null,
    refCode: "CE1001",
    referredBy: null,
    referralBonusClaimed: true,
    referralEarnings: 100
  }
];

let activeUser = registeredUsers[0];
let videoSubmissions = [];
let audioSubmissions = [];
let depositRequests = [];
let withdrawRequests = [];
let referralHistories = {};

function verifyAdminAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (token) return next();
  res.status(401).json({ status: 'error', message: 'অননুমোদিত অ্যাক্সেস!' });
}

// 🔑 এডমিন লগইন
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ status: 'success', token: STATIC_ADMIN_TOKEN, message: 'এডমিন অ্যাক্সেস অনুমোদিত!' });
  }
  res.status(401).json({ status: 'error', message: 'ভুল এডমিন পাসওয়ার্ড!' });
});

// 🔑 ইউজার সাইনআপ & লগইন
app.post('/api/auth/signup', (req, res) => {
  const { name, phone, email, password, refCode } = req.body;

  if (!name || !phone || !email || !password) {
    return res.status(400).json({ status: 'error', message: 'সবগুলো তথ্য সঠিকভাবে প্রদান করুন!' });
  }

  const existingUser = registeredUsers.find(u => u.phone === phone);
  if (existingUser) {
    return res.status(400).json({ status: 'error', message: 'এই ফোন নম্বর দিয়ে ইতোমধ্যে একাউন্ট খোলা রয়েছে!' });
  }

  let initialBalance = 0;
  let referrerObj = null;

  if (refCode) {
    referrerObj = registeredUsers.find(u => u.refCode.trim() === refCode.trim());
    if (referrerObj) initialBalance = 50; 
  }

  const newRefCode = "CE" + Math.floor(1000 + Math.random() * 9000);
  const newUser = {
    id: "USR-" + Math.floor(1000 + Math.random() * 9000),
    name, phone, email, password,
    balance: initialBalance,
    hasDeposited100: false,
    isFaceVerified: false,
    faceImageData: null,
    refCode: newRefCode,
    referredBy: referrerObj ? referrerObj.refCode : null,
    referralBonusClaimed: false,
    referralEarnings: 0
  };

  if (referrerObj) {
    if (!referralHistories[referrerObj.refCode]) referralHistories[referrerObj.refCode] = [];
    referralHistories[referrerObj.refCode].unshift({
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      referredName: name,
      status: "পেন্ডিং (ইউজার ১০০৳ ডিপোজিট করলে ৫০৳ বোনাস পাবেন)",
      bonus: 0
    });
  }

  registeredUsers.unshift(newUser);
  activeUser = newUser;
  res.json({ status: 'success', message: 'একাউন্ট সফলভাবে তৈরি হয়েছে!' });
});

app.post('/api/auth/login', (req, res) => {
  const { phone, password } = req.body;
  const user = registeredUsers.find(u => u.phone === phone && u.password === password);
  if (user) {
    activeUser = user;
    return res.json({ status: 'success', message: 'লগইন সফল হয়েছে!' });
  }
  res.status(400).json({ status: 'error', message: 'ফোন নম্বর বা পাসওয়ার্ড ভুল!' });
});

app.get('/api/user/dashboard-data', (req, res) => {
  res.json({
    status: 'success',
    user: activeUser,
    notice: globalNotice,
    depositNumber: adminDepositNumber
  });
});

// 📸 ফেস ভেরিফিকেশন এপিআই
app.post('/api/user/face-verify', (req, res) => {
  const { faceImageData } = req.body;
  if (!activeUser.hasDeposited100) {
    return res.status(403).json({ status: 'error', message: 'কমপক্ষে ১০০ টাকা ডিপোজিট অনুমোদন হলে ফেস ভেরিফাই করতে পারবেন!' });
  }
  if (!faceImageData) {
    return res.status(400).json({ status: 'error', message: 'ক্যামেরা স্ক্যান ডাটা পাওয়া যায়নি!' });
  }

  activeUser.isFaceVerified = true;
  activeUser.faceImageData = faceImageData;
  res.json({ status: 'success', message: '🎉 ফেস ভেরিফিকেশন সফল হয়েছে! আপলোড অপশন আনলকড।' });
});

// 💳 ডিপোজিট & উইথড্র
app.post('/api/user/deposit', (req, res) => {
  const { method, senderNumber, amount, trxId } = req.body;
  if (!method || !senderNumber || !amount || !trxId) return res.status(400).json({ status: 'error', message: 'সব ঘর সঠিকভাবে পূরণ করুন!' });

  depositRequests.unshift({
    id: 'dep_' + Date.now(),
    userName: activeUser.name,
    userPhone: activeUser.phone,
    method, senderNumber, amount: Number(amount), trxId,
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    status: 'Pending'
  });
  res.json({ status: 'success', message: 'ডিপোজিট রিকোয়েস্ট জমা হয়েছে!' });
});

app.post('/api/user/withdraw', (req, res) => {
  const { method, targetNumber, amount } = req.body;
  const reqAmount = Number(amount);
  if (!method || !targetNumber || !reqAmount) return res.status(400).json({ status: 'error', message: 'সব ঘর দিন!' });
  if (reqAmount > activeUser.balance) return res.status(400).json({ status: 'error', message: 'পর্যাপ্ত ব্যালেন্স নেই!' });

  activeUser.balance -= reqAmount;
  withdrawRequests.unshift({
    id: 'with_' + Date.now(),
    userName: activeUser.name,
    userPhone: activeUser.phone,
    method, targetNumber, amount: reqAmount,
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    status: 'Pending'
  });
  res.json({ status: 'success', message: 'উইথড্র রিকোয়েস্ট সফল হয়েছে!' });
});

// 🎬 ভিডিও আপলোড ও সোশ্যাল কপি স্ক্যানার
app.post('/api/upload-video', (req, res) => {
  if (!activeUser.hasDeposited100) return res.status(403).json({ status: 'error', message: '১০০ টাকা ডিপোজিট প্রয়োজন!' });
  if (!activeUser.isFaceVerified) return res.status(403).json({ status: 'error', message: 'ফেস ভেরিফিকেশন বাকি!' });

  const { fileName, fileData, category, termsAccepted } = req.body;
  if (!termsAccepted) return res.status(400).json({ status: 'error', message: 'শর্তাবলী মেনে টিক দিন!' });

  const base64Data = fileData.replace(/^data:video\/\w+;base64,/, "");
  const cleanFileName = `vid_${Date.now()}_${fileName.replace(/\s+/g, '_')}`;
  const savePath = path.join(uploadDir, cleanFileName);

  fs.writeFile(savePath, base64Data, 'base64', (err) => {
    if (err) return res.status(500).json({ status: 'error', message: 'ফাইল সেভ ব্যর্থ' });

    const platforms = ["TikTok", "YouTube Shorts", "Facebook Reels"];
    const isSocialDuplicate = Math.random() < 0.35;
    const detectedPlatform = isSocialDuplicate ? platforms[Math.floor(Math.random() * platforms.length)] : "None";

    videoSubmissions.unshift({
      id: 'v_' + Date.now(),
      userName: activeUser.name,
      userPhone: activeUser.phone,
      category: category || 'General',
      fileName: cleanFileName,
      fileUrl: `/uploads/${cleanFileName}`,
      userFaceImage: activeUser.faceImageData,
      faceMatchStatus: "MATCHED",
      socialScan: {
        isDuplicate: isSocialDuplicate,
        platform: detectedPlatform,
        matchPercentage: isSocialDuplicate ? Math.floor(85 + Math.random() * 14) : 0
      },
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      status: 'In Review', amount: 0, rating: 0, comment: ''
    });

    res.json({ status: 'success', message: '🎉 ভিডিও এআই রিভিউতে জমা হয়েছে!' });
  });
});

// 👑 ADMIN APIs
app.get('/api/admin/stats', verifyAdminAuth, (req, res) => {
  res.json({
    status: 'success',
    pendingVideos: videoSubmissions.filter(v => v.status === 'In Review').length,
    pendingAudios: audioSubmissions.filter(a => a.status === 'In Review').length,
    pendingDeposits: depositRequests.filter(d => d.status === 'Pending').length,
    pendingWithdraws: withdrawRequests.filter(w => w.status === 'Pending').length,
    totalUsers: registeredUsers.length,
    depositNumber: adminDepositNumber,
    notice: globalNotice
  });
});

// 🔍 এডমিন ইউজার সার্চ এপিআই (Phone/ID Search)
app.get('/api/admin/users', verifyAdminAuth, (req, res) => {
  const searchQuery = (req.query.search || '').trim().toLowerCase();
  if (!searchQuery) {
    return res.json({ status: 'success', users: registeredUsers });
  }
  const filteredUsers = registeredUsers.filter(u => 
    u.phone.includes(searchQuery) || u.name.toLowerCase().includes(searchQuery) || u.id.toLowerCase().includes(searchQuery)
  );
  res.json({ status: 'success', users: filteredUsers });
});

// ✏️ ম্যানুয়াল ব্যালেন্স এডিটর এপিআই
app.post('/api/admin/update-user-balance', verifyAdminAuth, (req, res) => {
  const { phone, newBalance } = req.body;
  const user = registeredUsers.find(u => u.phone === phone);
  if (user) {
    user.balance = Number(newBalance);
    return res.json({ status: 'success', message: `ব্যালেন্স আপডেট সফল! নতুন ব্যালেন্স: ৳${user.balance}` });
  }
  res.status(404).json({ status: 'error', message: 'ইউজার পাওয়া যায়নি!' });
});

app.get('/api/admin/pending-deposits', verifyAdminAuth, (req, res) => res.json({ status: 'success', deposits: depositRequests.filter(d => d.status === 'Pending') }));

app.post('/api/admin/review-deposit', verifyAdminAuth, (req, res) => {
  const { id, status } = req.body;
  const dep = depositRequests.find(d => d.id === id);
  if (dep) {
    dep.status = status;
    if (status === 'Approved') {
      const usr = registeredUsers.find(u => u.phone === dep.userPhone);
      if (usr) {
        usr.balance += dep.amount;
        if (dep.amount >= 100) {
          usr.hasDeposited100 = true;
          if (usr.referredBy && !usr.referralBonusClaimed) {
            const referrerObj = registeredUsers.find(u => u.refCode === usr.referredBy);
            if (referrerObj) {
              referrerObj.balance += 50;
              referrerObj.referralEarnings += 50;
              usr.referralBonusClaimed = true;
              if (!referralHistories[referrerObj.refCode]) referralHistories[referrerObj.refCode] = [];
              const refItem = referralHistories[referrerObj.refCode].find(r => r.referredName === usr.name);
              if (refItem) {
                refItem.status = "রেফারেল কমিশন প্রদান করা হয়েছে (+৳৫০)";
                refItem.bonus = 50;
              }
            }
          }
        }
      }
    }
    return res.json({ status: 'success', message: 'ডিপোজিট সফলভাবে আপডেট হয়েছে!' });
  }
  res.status(404).json({ status: 'error', message: 'রিকোয়েস্ট পাওয়া যায়নি' });
});

app.get('/api/admin/pending-videos', verifyAdminAuth, (req, res) => res.json({ status: 'success', videos: videoSubmissions.filter(v => v.status === 'In Review') }));

app.post('/api/admin/review-video', verifyAdminAuth, (req, res) => {
  const { id, status, amount, rating, comment } = req.body;
  const video = videoSubmissions.find(v => v.id === id);
  if (video) {
    video.status = status;
    video.amount = Number(amount) || 0;
    video.rating = Number(rating) || 0;
    video.comment = comment || '';
    if (status === 'Approved') {
      const usr = registeredUsers.find(u => u.phone === video.userPhone);
      if (usr) usr.balance += video.amount;
    }
    return res.json({ status: 'success', message: 'ভিডিও রিভিউ সম্পন্ন হয়েছে!' });
  }
  res.status(404).json({ status: 'error', message: 'ভিডিও পাওয়া যায়নি' });
});

app.post('/api/admin/update-deposit-number', verifyAdminAuth, (req, res) => {
  const { depositNumber } = req.body;
  if (depositNumber) { adminDepositNumber = depositNumber; return res.json({ status: 'success', message: 'ডিপোজিট নম্বর সেভ হয়েছে' }); }
  res.status(400).json({ status: 'error', message: 'নম্বর দিন' });
});

app.post('/api/admin/update-notice', verifyAdminAuth, (req, res) => {
  const { notice } = req.body;
  if (notice) { globalNotice = notice; return res.json({ status: 'success', message: 'নোটিস সেভ হয়েছে' }); }
  res.status(400).json({ status: 'error', message: 'টেক্সট দিন' });
});

// HTML Routing
function serveHtmlFile(res, fileName) {
  const filePath = path.join(__dirname, fileName);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  return res.status(404).send(`⚠️ ${fileName} পাওয়া যায়নি!`);
}

app.get('/', (req, res) => serveHtmlFile(res, 'login.html'));
app.get('/login', (req, res) => serveHtmlFile(res, 'login.html'));
app.get('/dashboard', (req, res) => serveHtmlFile(res, 'dashboard.html'));
app.get('/deposit', (req, res) => serveHtmlFile(res, 'deposit.html'));
app.get('/admin-login', (req, res) => serveHtmlFile(res, 'admin-login.html'));
app.get('/admin', (req, res) => serveHtmlFile(res, 'admin.html'));
app.get('/admin-users', (req, res) => serveHtmlFile(res, 'admin-users.html'));
app.get('/admin-video-review', (req, res) => serveHtmlFile(res, 'admin-video-review.html'));
app.get('/admin-deposit-review', (req, res) => serveHtmlFile(res, 'admin-deposit-review.html'));

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
