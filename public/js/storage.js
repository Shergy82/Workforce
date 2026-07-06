import { storage, isMockMode } from './firebase-config.js';

export async function uploadFile(folderPath, file) {
  if (isMockMode) {
    console.log(`Mocking upload for file: ${file.name} to ${folderPath}`);
    // Simulate upload latency
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Read file as Data URL to make it displayable in-browser
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  // Live Firebase Storage Upload
  const { ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js");
  const uniqueName = `${Date.now()}-${file.name}`;
  const fileRef = ref(storage, `${folderPath}/${uniqueName}`);
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
}
