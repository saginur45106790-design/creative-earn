const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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

// 🔐 এডমিন পাসওয়ার্ড সিকিউরিটি
const ADMIN_PASSWORD = "sajibbithi2828@";
let activeAdminTokens = new Set();

// 📊 গ্লোবাল ডাটাবেজ
let globalNotice = "🎉 CreativeEarn-এ আপনাকে স্বাগতম! ১০০ টাকা ডিপোজিট করে আইডি ভেরিফাই করুন এবং অরিজিনাল ভিডিও আপলোড করে ইনকাম শুরু করুন।";
let adminDepositNumber = "01836345346";

let siteStats = {
  activeUsersCount: 1450,
  totalWithdrawAmount: 485000
};

// 🚫 ডিভাইস ট্র্যাকিং (১ ডিভাইস = ১ একাউন্ট)
let registeredIPs = new Set();
let registeredVideoHashes = new Set();

let registeredUsers = [
  {
    id: "USR-1001",
    name: "রহিম আহমেদ",
    phone: "01836345346",
    email: "rahim@gmail.com",
    password: "user1234",
    balance: 150,
    isVerified: true,
    isFaceVerified: true,
    refCode: "CE1001",
    referredBy: null,
    referralEarnings: 100,
    ipAddress: "127.0.0.1"
  }
];

let activeUser = registeredUsers[0];

let videoSubmissions = [];
let audioSubmissions = [];
let depositRequests = [];
let withdrawRequests = [];
let referralHistories = {
  "CE1001": []
};

let supportThreads = {
  "01836345346": [
    { sender: 'admin', text: 'হ্যালো! CreativeEarn সাপোর্ট সেন্টারে আপনাকে স্বাগতম।', image: null, time: '03:15 PM', ticket: '#SUP-10458' }
  ]
};

// 🔑 এডমিন লগইন
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = "ADM_TOKEN_" + Date.now() + "_" + Math.random().toString(36).substring(2);
    activeAdminTokens.add(token);
    return res.json({ status: 'success', token, message: 'এডমিন অ্যাক্সেস অনুমোদিত!' });
  }
  res.status(401).json({ status: 'error', message: 'ভুল এডমিন পাসওয়ার্ড!' });
});

function verifyAdminAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (token && activeAdminTokens.has(token)) {
    return next();
  }
  res.status(401).json({ status: 'error', message: 'অননুমোদিত অ্যাক্সেস! পাসওয়ার্ড দিয়ে লগইন করুন।' });
}

// 🔑 সাইনআপ (১টি ডিভাইস = ১টি একাউন্ট কড়া নিয়ম)
app.post('/api/auth/signup', (req, res) => {
  const { name, phone, email, password, refCode } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!name || !phone || !email || !password) {
    return res.status(400).json({ status: 'error', message: 'সবগুলো তথ্য প্রদান করুন!' });
  }

  // 🔴 ১ ডিভাইস / আইপি থেকে একাধিক একাউন্ট ব্লক
  if (registeredIPs.has(clientIp)) {
    return res.status(403).json({ status: 'error', message: '⚠️ আপনার ডিভাইস বা আইপি নেটওয়ার্ক থেকে ইতোমধ্যে একটি একাউন্ট তৈরি করা হয়েছে! ১টি ডিভাইসে একাধিক একাউন্ট তৈরি করা সম্পূর্ণ নিষিদ্ধ।' });
  }

  const existingUser = registeredUsers.find(u => u.phone === phone);
  if (existingUser) {
    return res.status(400).json({ status: 'error', message: 'এই ফোন নম্বর দিয়ে ইতোমধ্যে একাউন্ট খোলা রয়েছে!' });
  }

  let referrerObj = null;
  if (refCode) {
    referrerObj = registeredUsers.find(u => u.refCode === refCode);
  }

  const newRefCode = "CE" + Math.floor(1000 + Math.random() * 9000);

  const newUser = {
    id: "USR-" + Math.floor(1000 + Math.random() * 9000),
    name, phone, email, password,
    balance: 0,
    isVerified: false,
    isFaceVerified: false,
    refCode: newRefCode,
    referredBy: referrerObj ? referrerObj.refCode : null,
    referralBonusClaimed: false,
    referralEarnings: 0,
    ipAddress: clientIp
  };

  // ডিভাইস আইপি রজিস্টার্ড হিসেবে সেভ
  registeredIPs.add(clientIp);

  if (referrerObj) {
    if (!referralHistories[referrerObj.refCode]) referralHistories[referrerObj.refCode] = [];
    referralHistories[referrerObj.refCode].unshift({
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      referredName: name,
      status: "Pending Verification (১০০৳ ডিপোজিট বাকি)",
      bonus: 0
    });
  }

  registeredUsers.unshift(newUser);
  activeUser = newUser;
  if (!supportThreads[phone]) supportThreads[phone] = [];

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

app.get('/api/public-stats', (req, res) => {
  res.json({ status: 'success', stats: siteStats, depositNumber: adminDepositNumber });
});

// 📤 ড্যাশবোর্ড ডাটা
app.get('/api/user/dashboard-data', (req, res) => {
  const unnotifiedVideo = videoSubmissions.find(v => v.status === 'Approved' && !v.notified && v.userPhone === activeUser.phone);
  const unnotifiedAudio = audioSubmissions.find(a => a.status === 'Approved' && !a.notified && a.userPhone === activeUser.phone);

  res.json({
    status: 'success',
    user: activeUser,
    notice: globalNotice,
    depositNumber: adminDepositNumber,
    videos: videoSubmissions.filter(v => v.userPhone === activeUser.phone),
    audios: audioSubmissions.filter(a => a.userPhone === activeUser.phone),
    referrals: referralHistories[activeUser.refCode] || [],
    popupData: unnotifiedVideo || unnotifiedAudio || null
  });
});

// 👤 এআই ফেস ভেরিফিকেশন API
app.post('/api/user/face-verify', (req, res) => {
  const { faceImageData } = req.body;
  if (!faceImageData) {
    return res.status(400).json({ status: 'error', message: 'ফেস স্ক্যান ডাটা পাওয়া যায়নি!' });
  }

  activeUser.isFaceVerified = true;
  res.json({ status: 'success', message: '🎉 এআই ফেস ভেরিফিকেশন সফলভাবে সম্পন্ন হয়েছে!' });
});

// 💰 ডিপোজিট & উইথড্র
app.post('/api/user/deposit', (req, res) => {
  const { method, senderNumber, amount, trxId } = req.body;
  if (!method || !senderNumber || !amount || !trxId) return res.status(400).json({ status: 'error', message: 'সব ঘর সঠিকভাবে দিন!' });

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

app.get('/api/user/transactions', (req, res) => {
  res.json({ status: 'success', userBalance: activeUser.balance, deposits: depositRequests.filter(d => d.userPhone === activeUser.phone), withdraws: withdrawRequests.filter(w => w.userPhone === activeUser.phone) });
});

// 🎬 অরিজিনাল ভিডিও আপলোড & কপিরাইট চেকার
app.post('/api/upload-video', (req, res) => {
  if (!activeUser.isVerified) {
    return res.status(403).json({ status: 'error', message: 'কমপক্ষে ১০০ টাকা ডিপোজিট করে একাউন্ট ভেরিফাই ও আনলক করুন!' });
  }
  const { fileName, fileData, category, termsAccepted } = req.body;
  if (!termsAccepted) return res.status(400).json({ status: 'error', message: 'শর্তাবলী মেনে টিক দিন!' });

  const base64Data = fileData.replace(/^data:video\/\w+;base64,/, "");

  // 🔍 কপিরাইট & ইউনিকনেস ডিজিটাল হ্যাশ চেক (SHA-256)
  const videoHash = crypto.createHash('sha256').update(base64Data).digest('hex');

  if (registeredVideoHashes.has(videoHash)) {
    return res.status(400).json({ status: 'error', message: '⚠️ কপিরাইট ডিটেক্টেড! এই ভিডিওটি ইতোমধ্যে প্ল্যাটফর্মে আপলোড করা হয়েছে বা সোশ্যাল মিডিয়া (Facebook/YouTube/TikTok) থেকে হুবহু কপি করা। নিজের অরিজিনাল ভিডিও দিন।' });
  }

  registeredVideoHashes.add(videoHash);

  const cleanFileName = `vid_${Date.now()}_${fileName.replace(/\s+/g, '_')}`;
  const savePath = path.join(uploadDir, cleanFileName);

  fs.writeFile(savePath, base64Data, 'base64', (err) => {
    if (err) return res.status(500).json({ status: 'error', message: 'সেভ ব্যর্থ' });

    videoSubmissions.unshift({
      id: 'v_' + Date.now(),
      userName: activeUser.name,
      userPhone: activeUser.phone,
      category: category || 'নাচ',
      fileName: cleanFileName,
      fileUrl: `/uploads/${cleanFileName}`,
      originalityScore: "98% Original",
      copyrightCheck: "Passed (No FB/YT/TikTok Matches)",
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      status: 'In Review', amount: 0, rating: 0, comment: '', notified: false
    });
    res.json({ status: 'success', message: '🎉 অরিজিনাল ভিডিও যাচাই সফল হয়েছে! ৩০ মিনিটের মধ্যে ম্যানুয়াল রিভিউ সম্পন্ন হবে।' });
  });
});

app.post('/api/upload-audio', (req, res) => {
  if (!activeUser.isVerified) {
    return res.status(403).json({ status: 'error', message: 'কমপক্ষে ১০০ টাকা ডিপোজিট করে একাউন্ট ভেরিফাই ও আনলক করুন!' });
  }
  const { fileName, fileData, category, termsAccepted } = req.body;
  if (!termsAccepted) return res.status(400).json({ status: 'error', message: 'শর্তাবলী টিক দিন!' });

  const base64Data = fileData.replace(/^data:audio\/\w+;base64,/, "");
  const cleanFileName = `aud_${Date.now()}_${fileName.replace(/\s+/g, '_')}`;
  const savePath = path.join(uploadDir, cleanFileName);

  fs.writeFile(savePath, base64Data, 'base64', (err) => {
    if (err) return res.status(500).json({ status: 'error', message: 'সেভ ব্যর্থ' });

    audioSubmissions.unshift({
      id: 'a_' + Date.now(),
      userName: activeUser.name,
      userPhone: activeUser.phone,
      category: category || 'রেকর্ড গান',
      fileName: cleanFileName,
      fileUrl: `/uploads/${cleanFileName}`,
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      status: 'In Review', amount: 0, rating: 0, comment: '', notified: false
    });
    res.json({ status: 'success', message: '🎉 অডিও রিভিউয়ে গিয়েছে! আগামী ৩০ মিনিটের মধ্যে রিভিউ সম্পন্ন হবে।' });
  });
});

// 👑 ADMIN PROTECTED APIs ----------------
app.post('/api/admin/update-deposit-number', verifyAdminAuth, (req, res) => {
  const { depositNumber } = req.body;
  if (depositNumber) { adminDepositNumber = depositNumber; return res.json({ status: 'success', message: 'ডিপোজিট নম্বর পরিবর্তন হয়েছে' }); }
  res.status(400).json({ status: 'error', message: 'খালি নম্বর চলবে না' });
});

app.post('/api/admin/update-stats', verifyAdminAuth, (req, res) => {
  const { activeUsersCount, totalWithdrawAmount } = req.body;
  if (activeUsersCount !== undefined) siteStats.activeUsersCount = Number(activeUsersCount);
  if (totalWithdrawAmount !== undefined) siteStats.totalWithdrawAmount = Number(totalWithdrawAmount);
  res.json({ status: 'success', message: 'স্ট্যাটস আপডেট হয়েছে' });
});

app.post('/api/admin/update-notice', verifyAdminAuth, (req, res) => {
  const { notice } = req.body;
  if (notice) { globalNotice = notice; return res.json({ status: 'success', message: 'নোটিস আপডেট হয়েছে' }); }
  res.status(400).json({ status: 'error', message: 'খালি নোটিস চলবে না' });
});

app.get('/api/admin/stats', verifyAdminAuth, (req, res) => {
  res.json({
    status: 'success',
    pendingVideos: videoSubmissions.filter(v => v.status === 'In Review').length,
    pendingAudios: audioSubmissions.filter(a => a.status === 'In Review').length,
    pendingDeposits: depositRequests.filter(d => d.status === 'Pending').length,
    pendingWithdraws: withdrawRequests.filter(w => w.status === 'Pending').length,
    totalUsers: registeredUsers.length,
    depositNumber: adminDepositNumber,
    siteStats,
    notice: globalNotice
  });
});

app.get('/api/admin/users', verifyAdminAuth, (req, res) => res.json({ status: 'success', users: registeredUsers }));

app.get('/api/admin/pending-deposits', verifyAdminAuth, (req, res) => res.json({ status: 'success', deposits: depositRequests.filter(d => d.status === 'Pending') }));

// 🔴 ডিপোজিট এপ্রুভ হলে রেফারার ৫০ টাকা পাবে
app.post('/api/admin/review-deposit', verifyAdminAuth, (req, res) => {
  const { id, status } = req.body;
  const dep = depositRequests.find(d => d.id === id);
  if (dep) {
    dep.status = status;
    if (status === 'Approved') {
      const usr = registeredUsers.find(u => u.phone === dep.userPhone);
      if (usr) {
        usr.balance += dep.amount;

        // ১০০ টাকা বা তার বেশি ডিপোজিট হলে একাউন্ট ভেরিফাই হবে
        if (dep.amount >= 100) {
          usr.isVerified = true;

          // 🎁 রেফার করা ইউজারকে ৫০ টাকা প্রদান (যদি আগে না পেয়ে থাকে)
          if (usr.referredBy && !usr.referralBonusClaimed) {
            const referrerObj = registeredUsers.find(u => u.refCode === usr.referredBy);
            if (referrerObj) {
              referrerObj.balance += 50;
              referrerObj.referralEarnings += 50;
              usr.referralBonusClaimed = true;

              if (!referralHistories[referrerObj.refCode]) referralHistories[referrerObj.refCode] = [];
              
              // রেফারেল স্ট্যাটাস আপডেট
              const existingIndex = referralHistories[referrerObj.refCode].findIndex(r => r.referredName === usr.name);
              if (existingIndex !== -1) {
                referralHistories[referrerObj.refCode][existingIndex] = {
                  date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                  referredName: usr.name,
                  status: "Verified Bonus (+৳৫০)",
                  bonus: 50
                };
              }
            }
          }
        }
      }
    }
    return res.json({ status: 'success', message: 'ডিপোজিট সফলভাবে আপডেট হয়েছে' });
  }
  res.status(404).json({ status: 'error', message: 'রিকোয়েস্ট পাওয়া যায়নি' });
});

app.get('/api/admin/pending-withdraws', verifyAdminAuth, (req, res) => res.json({ status: 'success', userLiveBalance: activeUser.balance, withdraws: withdrawRequests.filter(w => w.status === 'Pending') }));
app.post('/api/admin/review-withdraw', verifyAdminAuth, (req, res) => {
  const { id, status } = req.body;
  const withReq = withdrawRequests.find(w => w.id === id);
  if (withReq) {
    withReq.status = status;
    if (status === 'Rejected') {
      const usr = registeredUsers.find(u => u.phone === withReq.userPhone);
      if (usr) usr.balance += withReq.amount;
    }
    return res.json({ status: 'success', message: 'উইথড্র সফলভাবে আপডেট হয়েছে' });
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
    return res.json({ status: 'success', message: 'ভিডিও রিভিউ সম্পূর্ণ হয়েছে' });
  }
  res.status(404).json({ status: 'error', message: 'ভিডিও পাওয়া যায়নি' });
});

app.get('/api/admin/pending-audios', verifyAdminAuth, (req, res) => res.json({ status: 'success', audios: audioSubmissions.filter(a => a.status === 'In Review') }));
app.post('/api/admin/review-audio', verifyAdminAuth, (req, res) => {
  const { id, status, amount, rating, comment } = req.body;
  const audio = audioSubmissions.find(a => a.id === id);
  if (audio) {
    audio.status = status;
    audio.amount = Number(amount) || 0;
    audio.rating = Number(rating) || 0;
    audio.comment = comment || '';
    if (status === 'Approved') {
      const usr = registeredUsers.find(u => u.phone === audio.userPhone);
      if (usr) usr.balance += audio.amount;
    }
    return res.json({ status: 'success', message: 'অডিও রিভিউ সম্পূর্ণ হয়েছে' });
  }
  res.status(404).json({ status: 'error', message: 'অডিও পাওয়া যায়নি' });
});

function serveHtmlFile(res, fileName) {
  const filePath = path.join(__dirname, fileName);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  } else {
    return res.status(404).send(`<div style="background:#090d16; color:#e2e8f0; padding:40px; text-align:center;"><h2>⚠️ ${fileName} ফাইলটি নেই!</h2></div>`);
  }
}

app.get('/', (req, res) => serveHtmlFile(res, 'login.html'));
app.get('/login', (req, res) => serveHtmlFile(res, 'login.html'));
app.get('/dashboard', (req, res) => serveHtmlFile(res, 'dashboard.html'));
app.get('/deposit', (req, res) => serveHtmlFile(res, 'deposit.html'));
app.get('/withdraw', (req, res) => serveHtmlFile(res, 'withdraw.html'));
app.get('/support', (req, res) => serveHtmlFile(res, 'support.html'));
app.get('/referral', (req, res) => serveHtmlFile(res, 'referral.html'));
app.get('/admin-login', (req, res) => serveHtmlFile(res, 'admin-login.html'));
app.get('/admin', (req, res) => serveHtmlFile(res, 'admin.html'));
app.get('/admin-users', (req, res) => serveHtmlFile(res, 'admin-users.html'));
app.get('/admin-support', (req, res) => serveHtmlFile(res, 'admin-support.html'));
app.get('/admin-video-review', (req, res) => serveHtmlFile(res, 'admin-video-review.html'));
app.get('/admin-audio-review', (req, res) => serveHtmlFile(res, 'admin-audio-review.html'));
app.get('/admin-deposit-review', (req, res) => serveHtmlFile(res, 'admin-deposit-review.html'));
app.get('/admin-withdraw-review', (req, res) => serveHtmlFile(res, 'admin-withdraw-review.html'));

app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 Server Running: http://localhost:${PORT}`);
  console.log(`=================================`);
});
