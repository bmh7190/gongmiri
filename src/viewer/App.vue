<script setup lang="ts">
const onDrop = async (e: DragEvent) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file) return alert("파일이 없어요");
  if (!/\.zip$/i.test(file.name)) return alert("ZIP 파일을 드롭하세요");
  const buf = await file.arrayBuffer();
  console.log("[gongmiri] ZIP size:", buf.byteLength);
};

const prevent = (e: DragEvent) => { e.preventDefault(); };
</script>

<template>
  <div class="popup-container">
    <header class="header">
      <h2>공미리 — 공간데이터 미리보기</h2>
      <p>Shapefile ZIP을 드래그하거나 선택하세요.</p>
    </header>

    <div
      class="drop-zone"
      @drop="onDrop"
      @dragenter="prevent"
      @dragover="prevent"
    >
      파일 놓기
    </div>
  </div>
</template>

<style scoped>
.popup-container {
  width: 420px;
  min-height: 420px;
  max-height: 520px;
  padding: 24px;
  background: #fff;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header h2 {
  margin: 0;
  font-size: 20px;
}

.header p {
  margin: 6px 0 0;
  color: #4b5563;
  font-size: 14px;
}

.drop-zone {
  flex: 1;
  border: 2px dashed #9ca3af;
  border-radius: 12px;
  padding: 32px;
  text-align: center;
  color: #6b7280;
  background: #f9fafb;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-zone:hover {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}
</style>
