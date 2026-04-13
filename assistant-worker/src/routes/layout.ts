export function getLayout(title: string, content: string, extraScripts: string = "") {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Knowledge Hub</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; min-height: 100vh; margin: 0; }
        .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); }
        .nav-glass { background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
        .hover-lift { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .hover-lift:hover { transform: translateY(-4px); box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.6); border-color: rgba(255, 255, 255, 0.2); }
        
        /* Custom Scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }

        @keyframes fadeUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up { animation: fadeUp 0.6s ease-out forwards; opacity: 0; }
        
        .modal-enter { opacity: 0; scale: 0.95; pointer-events: none; }
        .modal-active { opacity: 1; scale: 1; pointer-events: auto; }
        .transition-modal { transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
    </style>
    ${extraScripts}
</head>
<body class="min-h-screen relative flex flex-col">
    <!-- Background Orbs -->
    <div class="fixed top-[-10%] left-[-5%] w-[40vw] h-[40vw] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none z-0"></div>
    <div class="fixed bottom-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full bg-emerald-600/10 blur-[120px] pointer-events-none z-0"></div>

    <!-- Persistent Top Navigation -->
    <header class="nav-glass sticky top-0 z-[100] w-full px-6 py-4">
        <div class="max-w-7xl mx-auto flex items-center justify-between">
            <div class="flex items-center space-x-8">
                <div>
                    <h1 class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                        Knowledge Hub
                    </h1>
                </div>
                <nav class="flex items-center space-x-1">
                    <a href="/dashboard" class="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/5 ${title === 'Dashboard' ? 'text-white bg-white/10' : 'text-slate-400'}">Overview</a>
                    <a href="/knowledge" class="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/5 ${title === 'Knowledge' || title === 'Edit' || title === 'New Knowledge' ? 'text-white bg-white/10' : 'text-slate-400'}">Documents</a>
                    <a href="/chat" class="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/5 ${title === 'Chat' ? 'text-white bg-white/10' : 'text-slate-400'}">Chat</a>
                </nav>
            </div>
            <div class="flex items-center space-x-4">
                <a href="/login" class="text-slate-500 hover:text-red-400 transition-colors text-xs font-bold uppercase tracking-widest">Sign Out</a>
            </div>
        </div>
    </header>

    <!-- Main Content Area -->
    <main class="flex-grow z-10 w-full relative">
        ${content}
    </main>

    <!-- Global Modal Context -->
    <div id="modal-backdrop" class="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[200] opacity-0 pointer-events-none transition-opacity duration-300 flex items-center justify-center p-4">
        <div id="modal-box" class="glass max-w-md w-full rounded-3xl p-8 shadow-2xl transition-modal modal-enter">
            <h3 id="modal-title" class="text-xl font-bold text-white mb-2">Notice</h3>
            <p id="modal-text" class="text-slate-400 text-sm mb-6 leading-relaxed"></p>
            <div id="modal-input-container" class="hidden mb-6">
                <input type="text" id="modal-input" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors" placeholder="...">
            </div>
            <div class="flex items-center justify-end space-x-3">
                <button id="modal-cancel" class="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button id="modal-confirm" class="px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20">Confirm</button>
            </div>
        </div>
    </div>

    <script>
        // Global Shared Scripts
        const backdrop = document.getElementById('modal-backdrop');
        const modalBox = document.getElementById('modal-box');
        const modalTitle = document.getElementById('modal-title');
        const modalText = document.getElementById('modal-text');
        const modalInputContainer = document.getElementById('modal-input-container');
        const modalInput = document.getElementById('modal-input');
        const modalConfirm = document.getElementById('modal-confirm');
        const modalCancel = document.getElementById('modal-cancel');

        let modalCallback = null;

        function showModal({ title, text, showInput = false, confirmText = "Confirm", cancelText = "Cancel" }, callback) {
            modalTitle.innerText = title;
            modalText.innerText = text;
            modalConfirm.innerText = confirmText;
            modalCancel.innerText = cancelText;
            modalCallback = callback;
            
            if (showInput) {
                modalInputContainer.classList.remove('hidden');
                modalInput.value = "";
                setTimeout(() => modalInput.focus(), 100);
            } else {
                modalInputContainer.classList.add('hidden');
            }

            backdrop.classList.add('opacity-100');
            backdrop.classList.remove('pointer-events-none');
            modalBox.classList.add('modal-active');
            modalBox.classList.remove('modal-enter');
        }

        function closeModal(confirmed) {
            backdrop.classList.remove('opacity-100');
            backdrop.classList.add('pointer-events-none');
            modalBox.classList.remove('modal-active');
            modalBox.classList.add('modal-enter');
            
            if (modalCallback) {
                if (confirmed) {
                    modalCallback(modalInputContainer.classList.contains('hidden') ? true : modalInput.value);
                } else {
                    modalCallback(null);
                }
            }
            modalCallback = null;
        }

        modalConfirm.onclick = () => closeModal(true);
        modalCancel.onclick = () => closeModal(false);
        backdrop.onclick = (e) => { if(e.target === backdrop) closeModal(false); };
    </script>
</body>
</html>
`;
}
