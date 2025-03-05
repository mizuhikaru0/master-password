import { generatePassword } from './config.js';
import { openDB, saveAccount, getAccounts, updateAccount, deleteAccount } from './db.js';
import { encryptData, decryptData } from './crypto.js';

let masterKey = '';
let dbInstance = null;
let accountsCache = []; // Cache untuk data akun yang dimuat

const SESSION_DURATION = 1 * 60 * 60 * 1000; // 1 jam dalam milidetik
const PASSWORD_UPDATE_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 hari dalam milidetik

// Gunakan sessionStorage untuk menyimpan informasi login (tanpa menyimpan masterKey secara persisten)
function checkLoginCache() {
  const cachedMaster = sessionStorage.getItem("loggedIn");
  const loginTimestamp = sessionStorage.getItem("loginTimestamp");

  if (cachedMaster && loginTimestamp) {
    const elapsed = Date.now() - Number(loginTimestamp);
    if (elapsed < SESSION_DURATION) {
      masterKey = cachedMaster;
      afterAuth(true);
      return;
    } else {
      sessionStorage.removeItem("loggedIn");
      sessionStorage.removeItem("loginTimestamp");
    }
  }
  initAuth();
}

// Tampilkan form login
function initAuth() {
  const authContainer = document.getElementById("setup");
  authContainer.innerHTML = `
    <h2>Masukkan Master Password</h2>
    <input type="password" id="masterPassword" placeholder="Master Password">
    <button id="loginBtn">Login</button>
  `;
  document.getElementById("loginBtn").addEventListener("click", handleLogin);
}

// Fungsi untuk menghasilkan salt acak
function generateSalt(length = 16) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Fungsi untuk melakukan hashing master password dengan salt menggunakan SHA-256
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Fungsi untuk menangani login dengan mekanisme hashing dan salting
async function handleLogin() {
  const input = document.getElementById("masterPassword").value;
  const storedHash = localStorage.getItem("masterHash");
  const storedSalt = localStorage.getItem("masterSalt");

  // Jika belum ada hash dan salt, artinya ini adalah login pertama
  if (!storedHash || !storedSalt) {
    const expectedPassword = generatePassword().toString();
    if (input !== expectedPassword) {
      alert("Master Password salah!");
      return;
    }
    // Login pertama: buat salt baru dan simpan hash hasil (salt + password)
    const newSalt = generateSalt();
    const newHash = await hashPassword(input, newSalt);
    localStorage.setItem("masterSalt", newSalt);
    localStorage.setItem("masterHash", newHash);
    alert("Master Password disimpan dengan aman (hash & salt telah disimpan).");
  } else {
    // Login berikutnya: hitung hash dari input menggunakan salt yang tersimpan dan verifikasi
    const hashedInput = await hashPassword(input, storedSalt);
    if (hashedInput !== storedHash) {
      alert("Master Password salah!");
      return;
    }
  }
  
  // Simpan masterKey di memori dan tandai sesi login di sessionStorage
  masterKey = input;
  sessionStorage.setItem("loggedIn", masterKey);
  sessionStorage.setItem("loginTimestamp", Date.now().toString());
  afterAuth(false);
}

// Setelah login berhasil, buka database dan tampilkan aplikasi utama
async function afterAuth(fromCache) {
  try {
    dbInstance = await openDB();
    document.getElementById("setup").style.display = "none";
    document.getElementById("app").style.display = "block";
    if (!fromCache) {
      alert("Autentikasi berhasil.");
    }
    addLogoutButton();
  } catch (error) {
    console.error("Gagal membuka database:", error);
  }
}

// Tambahkan tombol logout
function addLogoutButton() {
  if (!document.getElementById("logoutBtn")) {
    const btn = document.createElement("button");
    btn.id = "logoutBtn";
    btn.innerText = "Logout";
    btn.style.float = "right";
    btn.style.marginTop = "10px";
    btn.addEventListener("click", logout);
    document.getElementById("app").insertAdjacentElement("afterbegin", btn);
  }
}

// Fungsi logout: hapus informasi sesi dan muat ulang halaman
function logout() {
  sessionStorage.removeItem("loggedIn");
  sessionStorage.removeItem("loginTimestamp");
  masterKey = "";
  location.reload();
}

document.addEventListener("DOMContentLoaded", checkLoginCache);

// Fungsi untuk mengekspor data akun dengan menyertakan tracking hari (daysSinceLastChange)
// dan melakukan enkripsi ulang khusus untuk field password utama dan password di history
async function exportData() {
  try {
    const encryptedAccounts = await getAccounts(dbInstance);
    const exportArray = [];
    encryptedAccounts.forEach(record => {
      const decrypted = decryptData(record.data, masterKey);
      if (decrypted) {
        // Enkripsi ulang password utama
        const reEncryptedPassword = CryptoJS.AES.encrypt(decrypted.password, masterKey).toString();
        decrypted.password = reEncryptedPassword;
        
        // Enkripsi ulang password di history, jika ada
        if (decrypted.history && decrypted.history.length > 0) {
          decrypted.history = decrypted.history.map(entry => {
            return {
              password: CryptoJS.AES.encrypt(entry.password, masterKey).toString(),
              changedAt: entry.changedAt
            };
          });
        }
        
        // Hitung selisih hari sejak perubahan password terakhir
        let trackingDays = null;
        if (decrypted.history && decrypted.history.length > 0) {
          const lastEntry = decrypted.history[decrypted.history.length - 1];
          const lastChanged = new Date(lastEntry.changedAt);
          const diffTime = Math.abs(Date.now() - lastChanged.getTime());
          trackingDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        }
        decrypted.daysSinceLastChange = trackingDays;
        exportArray.push({ id: record.id, ...decrypted });
      }
    });
    const dataStr = JSON.stringify(exportArray, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    
    // Buat string tanggal dan waktu dengan format YYYY-MM-DD_HH-mm-ss
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const fileName = `data-password-akun-${dateStr}_${timeStr}.json`;
    
    const a = document.createElement('a');
    a.download = fileName;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch (error) {
    console.error("Export data gagal:", error);
  }
}

// Event listener untuk menyimpan akun baru
document.getElementById('saveAccountBtn').addEventListener('click', async () => {
  const website = document.getElementById('website').value;
  const username = document.getElementById('username').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  // Validasi: Website dan Password wajib diisi.
  if (!website || !password) {
    alert("Website dan Password wajib diisi!");
    return;
  }
  // Jika username kosong, maka email wajib diisi; jika email kosong, maka username wajib diisi.
  if (username.trim() === '' && email.trim() === '') {
    alert("Harap isi salah satu: Username atau Email. Jika Username tidak diisi, Email wajib diisi; begitu juga sebaliknya.");
    return;
  }
  
  const accountData = { 
    website, 
    username, 
    email,
    password, 
    history: [{ password, changedAt: new Date().toISOString() }] 
  };
  const encrypted = encryptData(accountData, masterKey);
  try {
    await saveAccount(dbInstance, encrypted);
    alert('Akun berhasil disimpan dengan aman.');
    // Bersihkan field input
    document.getElementById('website').value = '';
    document.getElementById('username').value = '';
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    // Perbarui tampilan akun dan ekspor data secara otomatis
    accountsCache = await getAccounts(dbInstance);
    displayAccounts(accountsCache);
    checkPasswordUpdateWarnings(accountsCache);
    exportData();
  } catch (error) {
    console.error('Error menyimpan akun:', error);
  }
});

// Event listener untuk memuat akun
document.getElementById('loadAccountsBtn').addEventListener('click', async () => {
  try {
    accountsCache = await getAccounts(dbInstance);
    displayAccounts(accountsCache);
    checkPasswordUpdateWarnings(accountsCache);
  } catch (error) {
    console.error('Error memuat akun:', error);
  }
});

// Fungsi untuk memeriksa apakah password suatu akun sudah lama tidak diperbarui
function checkPasswordUpdateWarnings(accounts) {
  const outdatedAccounts = [];
  const now = Date.now();
  accounts.forEach(record => {
    const decrypted = decryptData(record.data, masterKey);
    if (decrypted && decrypted.history && decrypted.history.length > 0) {
      const lastEntry = decrypted.history[decrypted.history.length - 1];
      const lastChanged = new Date(lastEntry.changedAt).getTime();
      if (now - lastChanged > PASSWORD_UPDATE_THRESHOLD) {
        outdatedAccounts.push(decrypted.website);
      }
    }
  });
  if (outdatedAccounts.length > 0) {
    alert("Peringatan: Akun berikut belum diperbarui dalam 90 hari: " + outdatedAccounts.join(", "));
  }
}

// Fungsi untuk menampilkan akun ke dalam tabel
function displayAccounts(accountsArray) {
  const tbody = document.getElementById('accountsBody');
  tbody.innerHTML = '';
  accountsArray.forEach(record => {
    console.log("Record ID:", record.id);
    const decrypted = decryptData(record.data, masterKey);
    if (decrypted) {
      const tr = document.createElement('tr');
      
      const websiteTd = document.createElement('td');
      websiteTd.innerText = decrypted.website;
      
      const usernameTd = document.createElement('td');
      usernameTd.innerText = decrypted.username;
      
      const emailTd = document.createElement('td');
      emailTd.innerText = decrypted.email || '';
      
      const passwordTd = document.createElement('td');
      passwordTd.innerText = decrypted.password;
      
      // Kolom Aksi: Edit dan Hapus
      const actionsTd = document.createElement('td');
      const editBtn = document.createElement('button');
      editBtn.innerText = 'Edit';
      editBtn.addEventListener('click', () => editAccount(record.id, decrypted));
      
      const deleteBtn = document.createElement('button');
      deleteBtn.innerText = 'Hapus';
      deleteBtn.addEventListener('click', () => {
        console.log("Klik hapus untuk id:", record.id);
        deleteAccountHandler(record.id);
      });
      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(deleteBtn);
      
      // Kolom Riwayat: Tampilkan riwayat perubahan password
      const historyTd = document.createElement('td');
      const historyBtn = document.createElement('button');
      historyBtn.innerText = 'Riwayat';
      historyBtn.addEventListener('click', () => viewHistory(decrypted.history));
      historyTd.appendChild(historyBtn);
      
      tr.appendChild(websiteTd);
      tr.appendChild(usernameTd);
      tr.appendChild(emailTd);
      tr.appendChild(passwordTd);
      tr.appendChild(actionsTd);
      tr.appendChild(historyTd);
      tbody.appendChild(tr);
    } else {
      console.warn('Data gagal didekripsi. Pastikan master password benar.');
    }
  });
  document.getElementById('accountsTable').style.display = accountsArray.length > 0 ? 'table' : 'none';
}

// Fitur Search: filter akun berdasarkan query
document.getElementById('searchInput').addEventListener('input', () => {
  const query = document.getElementById('searchInput').value.toLowerCase();
  const filteredAccounts = accountsCache.filter(record => {
    const decrypted = decryptData(record.data, masterKey);
    if (!decrypted) return false;
    return (
      decrypted.website.toLowerCase().includes(query) ||
      decrypted.username.toLowerCase().includes(query) ||
      (decrypted.email && decrypted.email.toLowerCase().includes(query)) ||
      decrypted.password.toLowerCase().includes(query)
    );
  });
  displayAccounts(filteredAccounts);
});

// Event listener untuk tombol export
document.getElementById('exportDataBtn').addEventListener('click', exportData);

// Event listener untuk tombol import
document.getElementById('importDataBtn').addEventListener('click', () => {
  document.getElementById('importFileInput').click();
});
document.getElementById('importFileInput').addEventListener('change', function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      if (!Array.isArray(importedData)) {
        alert("File tidak valid!");
        return;
      }
      for (const record of importedData) {
        // Jika record memiliki properti 'data', gunakan format lama
        if (record.data) {
          await saveAccount(dbInstance, record.data);
        } else {
          // Jika field password terenkripsi (biasanya diawali dengan "U2Fsd"), dekripsi dulu
          if (record.password && record.password.startsWith("U2Fsd")) {
            record.password = CryptoJS.AES.decrypt(record.password, masterKey).toString(CryptoJS.enc.Utf8);
          }
          // Proses history: dekripsi setiap password di history jika terenkripsi
          if (record.history && Array.isArray(record.history)) {
            record.history = record.history.map(entry => {
              if (entry.password && entry.password.startsWith("U2Fsd")) {
                entry.password = CryptoJS.AES.decrypt(entry.password, masterKey).toString(CryptoJS.enc.Utf8);
              }
              return entry;
            });
          }
          // Hapus properti tracking karena akan dihitung ulang
          delete record.daysSinceLastChange;
          // Enkripsi data dan simpan
          const encrypted = encryptData(record, masterKey);
          await saveAccount(dbInstance, encrypted);
        }
      }
      alert("Data berhasil diimpor.");
      accountsCache = await getAccounts(dbInstance);
      displayAccounts(accountsCache);
      checkPasswordUpdateWarnings(accountsCache);
    } catch (error) {
      console.error("Import data gagal:", error);
    }
  };
  reader.readAsText(file);
});

// Event listener untuk tombol print
document.getElementById('printDataBtn').addEventListener('click', () => {
  window.print();
});

// Fungsi untuk mengedit akun
async function editAccount(id, currentData) {
  const newWebsite = prompt("Edit Website:", currentData.website) || currentData.website;
  const newUsername = prompt("Edit Username:", currentData.username) || currentData.username;
  const newEmail = prompt("Edit Email:", currentData.email) || currentData.email;
  
  // Validasi: jika username kosong maka email wajib diisi, dan jika email kosong maka username wajib diisi.
  if (newUsername.trim() === '' && newEmail.trim() === '') {
    alert("Harap isi salah satu: Username atau Email. Jika salah satu tidak diisi, yang lain wajib diisi.");
    return;
  }
  
  let newPassword = prompt("Edit Password (kosongkan untuk tidak mengubah):", "");
  if (newPassword === null || newPassword === "") {
    newPassword = currentData.password;
  }
  
  let newHistory = currentData.history || [];
  if (newPassword !== currentData.password) {
    newHistory.push({ password: newPassword, changedAt: new Date().toISOString() });
  }
  
  const updatedAccount = {
    website: newWebsite,
    username: newUsername,
    email: newEmail,
    password: newPassword,
    history: newHistory
  };
  
  const encrypted = encryptData(updatedAccount, masterKey);
  try {
    await updateAccount(dbInstance, id, encrypted);
    alert("Akun berhasil diperbarui.");
    accountsCache = await getAccounts(dbInstance);
    displayAccounts(accountsCache);
    checkPasswordUpdateWarnings(accountsCache);
  } catch (error) {
    console.error("Error mengupdate akun:", error);
  }
}

// Fungsi untuk menghapus akun
async function deleteAccountHandler(id) {
  if (confirm("Apakah Anda yakin ingin menghapus akun ini?")) {
    try {
      console.log("Menghapus record dengan id:", id);
      await deleteAccount(dbInstance, id);
      alert("Akun berhasil dihapus.");
      accountsCache = await getAccounts(dbInstance);
      displayAccounts(accountsCache);
      checkPasswordUpdateWarnings(accountsCache);
    } catch (error) {
      console.error("Error menghapus akun:", error);
    }
  }
}

// Fungsi untuk menampilkan riwayat perubahan password
function viewHistory(history) {
  if (!history || history.length === 0) {
    alert("Tidak ada riwayat perubahan password.");
  } else {
    let historyText = "Riwayat Penggantian Password:\n";
    history.forEach((record, index) => {
      historyText += `${index + 1}. Password: ${record.password}, Waktu: ${record.changedAt}\n`;
    });
    alert(historyText);
  }
}

// Fungsi untuk menghasilkan password acak dengan panjang default 15 karakter
function generateRandomPassword(length = 15) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+[]{}|;:,.<>?";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

// Event listener untuk tombol Generate Password
document.getElementById('generatePasswordBtn').addEventListener('click', () => {
  const generatedPassword = generateRandomPassword();
  document.getElementById('password').value = generatedPassword;
});

// Event listener untuk toggle tampil/sembunyikan password
document.getElementById('togglePassword').addEventListener('click', function () {
  const passwordField = document.getElementById('password');
  if (passwordField.type === "password") {
    passwordField.type = "text";
    this.innerText = "Sembunyikan";
  } else {
    passwordField.type = "password";
    this.innerText = "Tampilkan";
  }
});

// Fungsi backup data ke Cloud (Firestore)
async function backupDataToCloud(masterKey, backupData) {
  try {
    // Gunakan masterKey sebagai identifier dokumen. Di aplikasi nyata, sebaiknya pakai user ID.
    const backupDocRef = doc(window.dbFirestore, "backups", masterKey);
    await setDoc(backupDocRef, {
      data: backupData,
      timestamp: new Date().toISOString()
    });
    alert("Backup ke cloud berhasil!");
  } catch (error) {
    console.error("Backup gagal:", error);
    alert("Backup ke cloud gagal.");
  }
}

// Fungsi restore data dari Cloud (Firestore)
async function restoreDataFromCloud(masterKey) {
  try {
    const backupDocRef = doc(window.dbFirestore, "backups", masterKey);
    const docSnap = await getDoc(backupDocRef);
    if (docSnap.exists()) {
      const backupData = docSnap.data().data;
      // Proses restore: misalnya, loop data backup dan simpan ke IndexedDB
      for (const record of backupData) {
        await saveAccount(dbInstance, record.data);
      }
      alert("Data berhasil dipulihkan dari cloud!");
      // Jika perlu, perbarui tampilan akun di UI
    } else {
      alert("Tidak ada data backup di cloud.");
    }
  } catch (error) {
    console.error("Restore gagal:", error);
    alert("Restore dari cloud gagal.");
  }
}

// Tambahkan event listener untuk tombol backup dan restore
document.getElementById('backupCloudBtn').addEventListener('click', async () => {
  // Ambil data akun yang sudah dienkripsi dari IndexedDB
  const encryptedAccounts = await getAccounts(dbInstance);
  // Misalnya, kita langsung backup array data tersebut
  backupDataToCloud(masterKey, encryptedAccounts);
});

document.getElementById('restoreCloudBtn').addEventListener('click', async () => {
  restoreDataFromCloud(masterKey);
});
