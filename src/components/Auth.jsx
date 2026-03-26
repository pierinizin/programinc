import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export function Auth() {
const [loading, setLoading] = useState(false);

// Agora controlamos 3 ecrãs: 'login', 'cadastro' ou 'recuperar'
const [view, setView] = useState('login'); 

// Nossos 3 campos
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [nome, setNome] = useState('');

const handleAuth = async (e) => {
  e.preventDefault();
  setLoading(true);

  if (view === 'login') {
    // MODO LOGIN
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erro ao entrar: " + error.message);
    
  } else if (view === 'cadastro') {
    // MODO CADASTRO
    if (!nome) {
      alert("Preencha o Nome Completo!");
      setLoading(false);
      return;
    }
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome: nome }
      }
    });
    
    if (error) {
      alert("Erro ao cadastrar: " + error.message);
    } else {
      alert("Conta criada com sucesso! Aguarde a aprovação de um Administrador.");
      setView('login'); // Volta pra tela de login
    }
    
  } else if (view === 'recuperar') {
    // MODO RECUPERAR SENHA
    if (!email) {
      alert("Digite o seu e-mail para recuperar a senha!");
      setLoading(false);
      return;
    }
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin, // Volta para o seu site após clicar no email
    });

    if (error) {
      alert("Erro ao enviar e-mail: " + error.message);
    } else {
      alert("✅ Link de recuperação enviado! Verifique a sua caixa de entrada (e o spam).");
      setView('login'); // Volta pra tela de login
    }
  }
  
  setLoading(false);
};

return (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '30px' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
        {view === 'login' ? 'Incovia - Acesso' : view === 'cadastro' ? 'Criar Conta' : 'Recuperar Senha'}
      </h2>
      
      <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        
        {/* O CAMPO DE NOME: Só aparece quando está em 'cadastro' */}
        {view === 'cadastro' && (
          <label className="full-row" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>Nome Completo</span>
            <input 
              type="text" 
              value={nome} 
              onChange={(e) => setNome(e.target.value)} 
              required={view === 'cadastro'} 
              style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
            />
          </label>
        )}

        <label className="full-row" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>E-mail</span>
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
          />
        </label>
        
        {/* O CAMPO DE SENHA: Só esconde se estiver a recuperar a senha */}
        {view !== 'recuperar' && (
          <label className="full-row" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>Senha</span>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required={view !== 'recuperar'} 
              style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
            />
          </label>
        )}

        <button className="primary-btn" type="submit" disabled={loading} style={{ marginTop: '10px' }}>
          {loading ? 'Aguarde...' : (view === 'login' ? 'Entrar' : view === 'cadastro' ? 'Cadastrar' : 'Enviar Link')}
        </button>
      </form>

      <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Botão de Esqueci a Senha - Só aparece no Login */}
        {view === 'login' && (
          <button 
            type="button"
            className="ghost-btn full" 
            onClick={() => setView('recuperar')}
          >
            Esqueci a minha senha
          </button>
        )}

        {/* Botão para alternar entre Login e Cadastro */}
        <button 
          type="button"
          className="ghost-btn full" 
          onClick={() => setView(view === 'login' ? 'cadastro' : 'login')}
        >
          {view === 'login' ? 'Não tem conta? Cadastre-se' : 'Voltar para o Login'}
        </button>
      </div>
    </div>
  </div>
);
}