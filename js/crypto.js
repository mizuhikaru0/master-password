export function encryptData(data, masterKey) {
  try {
    if (!masterKey) {
      throw new Error("Master key tidak tersedia.");
    }
    const jsonData = JSON.stringify(data);
    const ciphertext = CryptoJS.AES.encrypt(jsonData, masterKey).toString();
    return ciphertext;
  } catch (error) {
    console.error("Enkripsi gagal:", error);
    return null;
  }
}

export function decryptData(ciphertext, masterKey) {
  try {
    if (!masterKey) {
      throw new Error("Master key tidak tersedia.");
    }
    if (!ciphertext) {
      throw new Error("Ciphertext tidak tersedia.");
    }
    const bytes = CryptoJS.AES.decrypt(ciphertext, masterKey);
    const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
    if (!decryptedStr) {
      throw new Error("Dekripsi gagal, hasil string kosong.");
    }
    const decryptedData = JSON.parse(decryptedStr);
    return decryptedData;
  } catch (error) {
    console.error("Dekripsi gagal:", error);
    return null;
  }
}
