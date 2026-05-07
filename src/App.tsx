import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { motion, AnimatePresence } from 'motion/react';
import {
  ActionCheckboxes,
  BaixaForm,
  MobileScheduleDay,
  MobileFarmaInfo,
} from './MobileComponents';
import { 
  ClipboardCopy, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  FileDown, 
  UserMinus, 
  UserPlus, 
  Clock,
  ExternalLink,
  Smartphone,
  Monitor,
  ChevronRight,
  ChevronLeft,
  PenLine,
  Globe
} from 'lucide-react';

// --- Supabase ---
const SUPABASE_URL = 'https://aueoxuwqjyeeqapxnyke.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1ZW94dXdxanllZXFhcHhueWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNTI2OTQsImV4cCI6MjA5MjcyODY5NH0.Y9xjH9bgS5Eq6dpotqM5m92KVUGApWX5DZFLsMEQaW8';

const supabaseInsert = async (payload: Record<string, unknown>) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/escalas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${err}`);
  }
};

// ========================================
// GESTÃO DE FARMACÊUTICOS - SISTEMA COMPLETO
// ========================================
// Usa 2 tabelas:
// 1. farmaceuticos_por_filial → Estado ATUAL (quem está onde AGORA)
// 2. historico_movimentacoes → HISTÓRICO completo (nunca deleta)
// ========================================

interface FarmaceuticoFilial {
  filial: string;
  nome: string;
  crf: string;
  tipo_vinculo: 'Já vinculado' | 'Nova contratação' | 'Transferido';
  filial_origem?: string;
  data_entrada?: string;
  data_atualizacao: string;
}

interface HistoricoMovimentacao {
  nome: string;
  crf: string;
  acao: 'entrada' | 'saida' | 'atualizacao';
  filial: string;
  tipo_vinculo?: string;
  filial_origem?: string;
  filial_destino?: string;
  motivo_saida?: string;
  data_movimentacao: string;
  detalhes?: any;
}

// Registrar no histórico
const registrarHistorico = async (mov: HistoricoMovimentacao) => {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/historico_movimentacoes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(mov)
    });
  } catch (error) {
    console.error('❌ Erro ao registrar histórico:', error);
  }
};

// Atualizar estado atual de farmacêuticos de uma filial
const atualizarEstadoAtualFilial = async (
  filial: string,
  farmaceuticos: Array<{ nome: string; crf: string; tipoInclusao: string; filialOrigem?: string }>
) => {
  try {
    console.log(`🔄 Atualizando estado atual da filial ${filial}...`);
    
    // 1. Buscar farmacêuticos atualmente na filial
    const resAtual = await fetch(
      `${SUPABASE_URL}/rest/v1/farmaceuticos_por_filial?filial=eq.${filial}`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    );
    
    const farmAtual = resAtual.ok ? await resAtual.json() : [];
    const nomesAtual = new Set(farmAtual.map((f: FarmaceuticoFilial) => f.nome));
    const nomesNovo = new Set(farmaceuticos.map(f => f.nome).filter(Boolean));
    
    // 2. REMOVER quem saiu (não está mais na nova lista)
    for (const farm of farmAtual) {
      if (!nomesNovo.has(farm.nome)) {
        // Registrar saída no histórico
        await registrarHistorico({
          nome: farm.nome,
          crf: farm.crf,
          acao: 'saida',
          filial: filial,
          motivo_saida: 'Remoção da escala',
          data_movimentacao: new Date().toISOString()
        });
        
        // Remover do estado atual
        await fetch(
          `${SUPABASE_URL}/rest/v1/farmaceuticos_por_filial?nome=eq.${encodeURIComponent(farm.nome)}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            }
          }
        );
        
        console.log(`➖ ${farm.nome} removido da filial ${filial}`);
      }
    }
    
    // 3. ADICIONAR ou ATUALIZAR cada farmacêutico da nova lista
    for (const farm of farmaceuticos) {
      if (!farm.nome) continue;
      
      const payload: FarmaceuticoFilial = {
        filial,
        nome: farm.nome,
        crf: farm.crf || '',
        tipo_vinculo: farm.tipoInclusao as any || 'Já vinculado',
        filial_origem: farm.filialOrigem || undefined,
        data_atualizacao: new Date().toISOString()
      };
      
      if (nomesAtual.has(farm.nome)) {
        // JÁ EXISTE na filial - Atualizar
        await fetch(
          `${SUPABASE_URL}/rest/v1/farmaceuticos_por_filial?nome=eq.${encodeURIComponent(farm.nome)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payload)
          }
        );
        
        // Registrar atualização no histórico
        await registrarHistorico({
          nome: farm.nome,
          crf: farm.crf,
          acao: 'atualizacao',
          filial: filial,
          tipo_vinculo: farm.tipoInclusao,
          data_movimentacao: new Date().toISOString()
        });
        
        console.log(`📝 ${farm.nome} atualizado na filial ${filial}`);
      } else {
        // NOVO na filial - Adicionar
        payload.data_entrada = new Date().toISOString();
        
        await fetch(
          `${SUPABASE_URL}/rest/v1/farmaceuticos_por_filial`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payload)
          }
        );
        
        // Registrar entrada no histórico
        await registrarHistorico({
          nome: farm.nome,
          crf: farm.crf,
          acao: 'entrada',
          filial: filial,
          tipo_vinculo: farm.tipoInclusao,
          filial_origem: farm.filialOrigem,
          data_movimentacao: new Date().toISOString()
        });
        
        console.log(`✅ ${farm.nome} adicionado na filial ${filial}`);
      }
    }
    
    console.log(`✅ Estado atual da filial ${filial} atualizado!`);
  } catch (error) {
    console.error(`❌ Erro ao atualizar filial ${filial}:`, error);
  }
};

// Processar transferências (remover da origem)
const processarTransferencias = async (
  farmaceuticos: Array<{ nome: string; crf: string; tipoInclusao: string; filialOrigem: string }>,
  filialDestino: string
) => {
  const transferidos = farmaceuticos.filter(f => f.tipoInclusao === 'Transferido' && f.filialOrigem);
  
  for (const farm of transferidos) {
    if (!farm.nome || !farm.filialOrigem) continue;
    
    try {
      // Buscar dados atuais do farmacêutico
      const resAtual = await fetch(
        `${SUPABASE_URL}/rest/v1/farmaceuticos_por_filial?nome=eq.${encodeURIComponent(farm.nome)}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          }
        }
      );
      
      if (resAtual.ok) {
        const [farmAtual] = await resAtual.json();
        
        if (farmAtual && farmAtual.filial === farm.filialOrigem) {
          // Registrar SAÍDA da origem no histórico
          await registrarHistorico({
            nome: farm.nome,
            crf: farm.crf,
            acao: 'saida',
            filial: farm.filialOrigem,
            filial_destino: filialDestino,
            motivo_saida: 'Transferência',
            data_movimentacao: new Date().toISOString()
          });
          
          // Remover da filial de origem
          await fetch(
            `${SUPABASE_URL}/rest/v1/farmaceuticos_por_filial?nome=eq.${encodeURIComponent(farm.nome)}`,
            {
              method: 'DELETE',
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              }
            }
          );
          
          console.log(`🔄 ${farm.nome} transferido: ${farm.filialOrigem} → ${filialDestino}`);
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao processar transferência de ${farm.nome}:`, error);
    }
  }
};

// Processar baixas (desligamentos e transferências de saída)
const processarBaixas = async (
  filial: string,
  baixaDetails: { nome: string; motivo: string; filialDestino?: string }
) => {
  if (!baixaDetails.nome) return;
  
  try {
    // Buscar farmacêutico atual
    const resAtual = await fetch(
      `${SUPABASE_URL}/rest/v1/farmaceuticos_por_filial?nome=eq.${encodeURIComponent(baixaDetails.nome)}`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    );
    
    if (!resAtual.ok) return;
    
    const [farmaceutico] = await resAtual.json();
    if (!farmaceutico) return;
    
    if (baixaDetails.motivo === 'Desligamento') {
      // Registrar DESLIGAMENTO no histórico
      await registrarHistorico({
        nome: farmaceutico.nome,
        crf: farmaceutico.crf,
        acao: 'saida',
        filial: filial,
        motivo_saida: 'Desligamento',
        data_movimentacao: new Date().toISOString()
      });
      
      // Remover do estado atual
      await fetch(
        `${SUPABASE_URL}/rest/v1/farmaceuticos_por_filial?nome=eq.${encodeURIComponent(baixaDetails.nome)}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          }
        }
      );
      
      console.log(`🗑️ ${baixaDetails.nome} desligado da filial ${filial}`);
    } 
    else if (baixaDetails.motivo === 'Transferência' && baixaDetails.filialDestino) {
      // Registrar SAÍDA por transferência no histórico
      await registrarHistorico({
        nome: farmaceutico.nome,
        crf: farmaceutico.crf,
        acao: 'saida',
        filial: filial,
        filial_destino: baixaDetails.filialDestino,
        motivo_saida: 'Transferência',
        data_movimentacao: new Date().toISOString()
      });
      
      // Remover da filial atual
      await fetch(
        `${SUPABASE_URL}/rest/v1/farmaceuticos_por_filial?nome=eq.${encodeURIComponent(baixaDetails.nome)}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          }
        }
      );
      
      // Adicionar na filial destino
      await fetch(
        `${SUPABASE_URL}/rest/v1/farmaceuticos_por_filial`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            filial: baixaDetails.filialDestino,
            nome: farmaceutico.nome,
            crf: farmaceutico.crf,
            tipo_vinculo: 'Transferido',
            filial_origem: filial,
            data_entrada: new Date().toISOString(),
            data_atualizacao: new Date().toISOString()
          })
        }
      );
      
      // Registrar ENTRADA na nova filial no histórico
      await registrarHistorico({
        nome: farmaceutico.nome,
        crf: farmaceutico.crf,
        acao: 'entrada',
        filial: baixaDetails.filialDestino,
        tipo_vinculo: 'Transferido',
        filial_origem: filial,
        data_movimentacao: new Date().toISOString()
      });
      
      console.log(`🔄 ${baixaDetails.nome} transferido: ${filial} → ${baixaDetails.filialDestino}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao processar baixa de ${baixaDetails.nome}:`, error);
  }
};

// --- Types ---
type Day = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';
const DAYS: Day[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

interface ScheduleRow {
  seg: string;
  ter: string;
  qua: string;
  qui: string;
  sex: string;
  sab: string;
  dom: string;
}

interface Pharmacist {
  id: number;
  nome: string;
  cpf: string;
  crf: string; // New field
  dataNascimento: string;
  tipoInclusao: 'Já vinculado' | 'Nova contratação' | 'Transferido';
  filialOrigem: string;
  entrada: ScheduleRow;
  intervalo: ScheduleRow;
  retorno: ScheduleRow;
  saida: ScheduleRow;
}

interface Actions {
  alterarHorario: boolean;
  baixaFarma: boolean;
  inclusaoFarma: boolean;
}

interface BaixaDetails {
  nome: string;
  motivo: 'Desligamento' | 'Transferência';
  filialDestino: string;
}

// PDFs carregados da pasta public/
// Coloque os arquivos em: public/template.pdf e public/declaracao.pdf
const TEMPLATE_PDF_URL = '/template.pdf';
const DECLARACAO_PDF_URL = '/Documento Transferência - Site V2.pdf';

const FILIAIS: Record<string, { cidade: string; endereco: string }> = {
  "1": { cidade: "PORTO ALEGRE", endereco: "R. Dr. Flores, 194" },
  "2": { cidade: "PORTO ALEGRE", endereco: "Rua Ramiro Barcelos, nº 910, bloco E" },
  "4": { cidade: "PORTO ALEGRE", endereco: "Av. Borges de Medeiros, 589- e 595" },
  "5": { cidade: "PORTO ALEGRE", endereco: "Av. Azenha, 693" },
  "7": { cidade: "PORTO ALEGRE", endereco: "Av. Azenha, 1.401" },
  "8": { cidade: "PORTO ALEGRE", endereco: "Av. Assis Brasil, 1983" },
  "9": { cidade: "PORTO ALEGRE", endereco: "Av. Protásio Alves, 2640" },
  "10": { cidade: "PORTO ALEGRE", endereco: "Rua dos Andradas, 1238" },
  "11": { cidade: "PORTO ALEGRE", endereco: "Rua dos Andradas, 1401" },
  "12": { cidade: "PORTO ALEGRE", endereco: "Av. Venâncio Aires, 1102" },
  "13": { cidade: "PORTO ALEGRE", endereco: "Rua João Wallig, 1800 Lj. JW 13-Iguatemi" },
  "15": { cidade: "PORTO ALEGRE", endereco: "Av. Borges de Medeiros, 255" },
  "17": { cidade: "PORTO ALEGRE", endereco: "Av. Cristóvão Colombo, 2110" },
  "19": { cidade: "PORTO ALEGRE", endereco: "Avenida São Pedro, 577" },
  "20": { cidade: "PORTO ALEGRE", endereco: "Av. João Pessoa, 1831 – Lj. 1A - 202/203" },
  "21": { cidade: "PORTO ALEGRE", endereco: "Rua Vinte e Quatro de Outubro, 742" },
  "23": { cidade: "PORTO ALEGRE", endereco: "Av. Plínio Brasil Milano, 1000" },
  "25": { cidade: "PORTO ALEGRE", endereco: "Av. São Pedro, 878 – São Geraldo" },
  "28": { cidade: "PORTO ALEGRE", endereco: "Av. Getúlio Vargas, n° 480" },
  "29": { cidade: "PORTO ALEGRE", endereco: "Rua Ramiro Barcelos, 1115" },
  "30": { cidade: "SÃO SEBASTIÃO DO CAI", endereco: "Avenida Egidio Michaelsen, 477, bairro Centro" },
  "31": { cidade: "PORTO ALEGRE", endereco: "Avenida Protásio Alves, 4194 - subsolo" },
  "34": { cidade: "SAO LEOPOLDO", endereco: "Rua Independência, 424" },
  "35": { cidade: "SANTA CRUZ DO SUL", endereco: "Rua Marechal Floriano, 863" },
  "36": { cidade: "BAGE", endereco: "Av. Sete de Setembro, 1121" },
  "37": { cidade: "SANTA VITORIA DO PALMAR", endereco: "Rua Barão do Rio Branco, 439" },
  "38": { cidade: "PORTO ALEGRE", endereco: "Av. Cavalhada, 2955" },
  "40": { cidade: "URUGUAIANA", endereco: "Rua Duque de Caxias, 1625" },
  "41": { cidade: "CRUZ ALTA", endereco: "Avenida General Osório, 150, bairro Centro" },
  "43": { cidade: "PORTO ALEGRE", endereco: "Av. Assis Brasil, 3522" },
  "44": { cidade: "PORTO ALEGRE", endereco: "Av. Teresópolis, 3126" },
  "45": { cidade: "PORTO ALEGRE", endereco: "Av. Protásio Alves, 723" },
  "47": { cidade: "ALVORADA", endereco: "Avenida Presidente Vargas, nº 1957" },
  "48": { cidade: "PORTO ALEGRE", endereco: "Rua Zeca Neto, 38" },
  "50": { cidade: "ALEGRETE", endereco: "Rua Gaspar Martins, 322" },
  "51": { cidade: "BAGE", endereco: "Rua Monsenhor Hipólito, 02 Lj 01" },
  "52": { cidade: "PELOTAS", endereco: "Rua Andrade Neves, 1881" },
  "53": { cidade: "CACHOEIRA DO SUL", endereco: "Rua Júlio de Castilhos, 102" },
  "54": { cidade: "CAMAQUA", endereco: "Av. Presidente Vargas, 447" },
  "56": { cidade: "CARAZINHO", endereco: "Av. Flores da Cunha, 1421" },
  "57": { cidade: "CAXIAS DO SUL", endereco: "Av. Júlio de Castilhos, 1970" },
  "58": { cidade: "CRUZ ALTA", endereco: "Rua Duque de Caxias, 645 sala 03" },
  "59": { cidade: "CAPAO DA CANOA", endereco: "Av. Paraguassú, 2696" },
  "60": { cidade: "IJUI", endereco: "Rua XV de Novembro, 386" },
  "61": { cidade: "SANTANA DO LIVRAMENTO", endereco: "Rua dos Andradas, 485" },
  "62": { cidade: "SANTANA DO LIVRAMENTO", endereco: "Rua dos Andradas, 51" },
  "63": { cidade: "PELOTAS", endereco: "Av. General Osório, 1052" },
  "64": { cidade: "RIO GRANDE", endereco: "Rua Marechal Floriano Peixoto, 351" },
  "65": { cidade: "ROSARIO DO SUL", endereco: "R JOAO BRASIL, 831" },
  "66": { cidade: "SANTO ANGELO", endereco: "Rua Marquês do Herval, 1583" },
  "67": { cidade: "SANTA MARIA", endereco: "Rua Acampamento, 150" },
  "68": { cidade: "SAO LOURENCO DO SUL", endereco: "Rua Coronel Alfredo Born, 317" },
  "70": { cidade: "SANTIAGO", endereco: "Rua Getúlio Vargas, 1851" },
  "71": { cidade: "FARROUPILHA", endereco: "R Pinheiro Machado, 195 - Sala 02" },
  "72": { cidade: "SÃO BORJA", endereco: "Rua General Osório, 2160" },
  "73": { cidade: "SAO LUIZ GONZAGA", endereco: "Av. Sen. Pinheiro Machado, 2476" },
  "74": { cidade: "URUGUAIANA", endereco: "Rua Domingos de Almeida, 1946" },
  "75": { cidade: "VACARIA", endereco: "Rua Borges de Medeiros, 1313" },
  "77": { cidade: "DOM PEDRITO", endereco: "Av. Rio Branco, 844" },
  "78": { cidade: "BENTO GONCALVES", endereco: "Rua Marechal Deodoro, 17" },
  "79": { cidade: "ITAQUI", endereco: "Avenida Humberto de Alencar Castelo Branco, nº 1044" },
  "80": { cidade: "TAQUARA", endereco: "Rua Júlio de Castilhos, 2594" },
  "81": { cidade: "TRES PASSOS", endereco: "Av. Júlio de Castilhos, 788" },
  "82": { cidade: "TRAMANDAI", endereco: "Av. Emancipação, 161" },
  "83": { cidade: "TORRES", endereco: "Avenida Barão do Rio Branco, nº 235, bairro Centro" },
  "84": { cidade: "SANTA ROSA", endereco: "Av. Rio Branco, 447" },
  "85": { cidade: "PALMEIRA DAS MISSOES", endereco: "Av. Independência, 1112" },
  "87": { cidade: "PORTO ALEGRE", endereco: "Av. Venâncio Aires, 399, Loja 01" },
  "88": { cidade: "SANTO ANGELO", endereco: "Rua Marquês do Herval, 1118" },
  "91": { cidade: "PELOTAS", endereco: "Rua Santos Dumont, 856" },
  "92": { cidade: "PELOTAS", endereco: "Rua Quinze de Novembro , 454" },
  "93": { cidade: "PELOTAS", endereco: "Rua Santos Dumont, 487" },
  "94": { cidade: "RIO GRANDE", endereco: "Rua Luiz Lórea, 502" },
  "95": { cidade: "RIO GRANDE", endereco: "Rua 24 de Maio, 400/402" },
  "96": { cidade: "JAGUARAO", endereco: "Rua 27 de Janeiro, 408" },
  "97": { cidade: "PELOTAS", endereco: "Rua Andrade Neves, 1575" },
  "98": { cidade: "PELOTAS", endereco: "Av. Bento Gonçalves, 3331" },
  "101": { cidade: "PORTO ALEGRE", endereco: "Av. Praia de Belas, 1181 – Lj 7" },
  "102": { cidade: "ALEGRETE", endereco: "Praça Presidente Getúlio Vargas, 360" },
  "103": { cidade: "FREDERICO WESTPHALEN", endereco: "Rua do Comércio, 590" },
  "111": { cidade: "PORTO ALEGRE", endereco: "Avenida Baltazar de Oliveira Garcia, nº 3710, bairro Rubem Berta" },
  "113": { cidade: "PORTO ALEGRE", endereco: "Av. Oscar Pereira, 2679" },
  "114": { cidade: "CACHOEIRA DO SUL", endereco: "Rua Sete de Setembro, 1109" },
  "115": { cidade: "SANTA MARIA", endereco: "Praça Saldanha Marinho, 35" },
  "117": { cidade: "NOVO HAMBURGO", endereco: "Av. Nações Unidas, 2001/1001 – Rio Branco" },
  "118": { cidade: "SÃO GABRIEL", endereco: "Rua General Mallet, 456 terreo" },
  "119": { cidade: "PASSO FUNDO", endereco: "Rua Moron, 1513" },
  "120": { cidade: "CANOAS", endereco: "Av. Getúlio Vargas, 5765" },
  "121": { cidade: "TORRES", endereco: "Av. Barão do Rio Branco, 52" },
  "122": { cidade: "SAO LEOPOLDO", endereco: "Avenida Indepedência, 714" },
  "123": { cidade: "PORTO ALEGRE", endereco: "Rua General Lima e Silva, 606" },
  "125": { cidade: "OSORIO", endereco: "Rua Major João Marques, 515 – Lj 01" },
  "126": { cidade: "PORTO ALEGRE", endereco: "Av. Assis Brasil, 4320 Sala 51" },
  "127": { cidade: "PORTO ALEGRE", endereco: "Av. Nilópolis, 543 - Lj. 5/6" },
  "128": { cidade: "GRAMADO", endereco: "Av. Borges de Medeiros, 2506" },
  "130": { cidade: "SAPUCAIA DO SUL", endereco: "Avenida Sapucaia, nº 2.096, sala 2102" },
  "131": { cidade: "CAXIAS DO SUL", endereco: "Rua General Arcy da Rocha Nóbrega, 421" },
  "133": { cidade: "NOVO HAMBURGO", endereco: "Av. Pedro Adams Filho, 5477 , loja 01" },
  "137": { cidade: "PASSO FUNDO", endereco: "Av. Brasil Leste, 200 – Lj 42/44" },
  "138": { cidade: "PORTO ALEGRE", endereco: "Cristóvão Colombo, 1271 – Lj 101" },
  "139": { cidade: "PORTO ALEGRE", endereco: "Av. Ipiranga, 5200 – Lj 146" },
  "140": { cidade: "CAPAO DA CANOA", endereco: "Av. Flavio Boianovski 1417" },
  "141": { cidade: "PORTO ALEGRE", endereco: "Av. Doutor Nilo Peçanha, 1737" },
  "142": { cidade: "PORTO ALEGRE", endereco: "Rua Santa Cecília, 1269 – Lj 01" },
  "144": { cidade: "CAPAO DA CANOA", endereco: "Av. Paraguassú, 4048 - Lj 03" },
  "146": { cidade: "IMBE", endereco: "Avenida Paraguassú, nº 1.474, bairro Centro" },
  "149": { cidade: "RIO PARDO", endereco: "Rua Andrade Neves, 626" },
  "151": { cidade: "PORTO ALEGRE", endereco: "Rua Múcio Teixeira, 680 – Lj 103/104" },
  "153": { cidade: "PORTO ALEGRE", endereco: "Rua Olavo Barreto Viana, 36 – Lj 126" },
  "157": { cidade: "PASSO FUNDO", endereco: "Rua Uruguai, 1620 – Salas 212/213" },
  "159": { cidade: "RIO GRANDE", endereco: "Av. Rio Grande, 162" },
  "160": { cidade: "GRAVATAÍ", endereco: "Av. José Loureiro da Silva, 1504" },
  "161": { cidade: "PORTO ALEGRE", endereco: "Avenida Assis Brasil, nº 164 – SUC 61 e 62, bairro Santa Maria Goretti" },
  "163": { cidade: "PORTO ALEGRE", endereco: "Av. João Wallig, 1903" },
  "164": { cidade: "PORTO ALEGRE", endereco: "Av. Carlos Gomes, 11 – Lj 03" },
  "165": { cidade: "PORTO ALEGRE", endereco: "Av. Ipiranga, 6690 - Bl 02/Prédio 60/Térreo" },
  "166": { cidade: "PORTO ALEGRE", endereco: "Av. Túlio de Rose, 80 – Loja 129 e 130" },
  "167": { cidade: "PORTO ALEGRE", endereco: "Av. Otto Niemeyer, 2500 - Lojas 103 e 104" },
  "168": { cidade: "PORTO ALEGRE", endereco: "Avenida Mostardeiro, 287" },
  "170": { cidade: "NOVO HAMBURGO", endereco: "Rua 1º de Março, 1111 – Lj 03" },
  "171": { cidade: "PORTO ALEGRE", endereco: "Av. Cavalhada, 3621 – LJ 01" },
  "173": { cidade: "CAXIAS DO SUL", endereco: "Avenida Júlio de Castilhos, nº 2.234, loja 1" },
  "175": { cidade: "CANOAS", endereco: "Rua Quinze de Janeiro, nº 481, salas 214-3 / 214-4 / 214-5" },
  "176": { cidade: "ERECHIM", endereco: "Av. Maurício Cardoso, 17" },
  "178": { cidade: "ESTEIO", endereco: "R Padre Felipe, 257" },
  "179": { cidade: "MARAU", endereco: "Rua Julio Borella, 1067 – Sala 102" },
  "181": { cidade: "CANOAS", endereco: "Rua Tiradentes, 291" },
  "182": { cidade: "PORTO ALEGRE", endereco: "Av. Cristóvão Colombo, 545 – Lj 1224 – Sh Total" },
  "183": { cidade: "PORTO ALEGRE", endereco: "Av. Independência, 155 – Sala 02" },
  "184": { cidade: "PORTO ALEGRE", endereco: "Rua Otto Niemayer, 601 – Tristeza" },
  "185": { cidade: "PORTO ALEGRE", endereco: "Avenida Serevo Dullius, 90010 - T1.N2.057" },
  "186": { cidade: "PORTO ALEGRE", endereco: "Av. Juca Batista, 925 – Lj 101" },
  "187": { cidade: "ESTRELA", endereco: "R RUA TIRADENTES, 248" },
  "188": { cidade: "NOVO HAMBURGO", endereco: "Av. Pedro Adans Filho, 5573" },
  "190": { cidade: "CAXIAS DO SUL", endereco: "Rua Vinte de Setembro, 2352 – Lurdes" },
  "192": { cidade: "PORTO ALEGRE", endereco: "Av. Wenceslau Escobar, 2857 Lj 04" },
  "193": { cidade: "TRAMANDAI", endereco: "Av. Emancipação, 898 – Lj ¾ - Praia" },
  "194": { cidade: "CIDREIRA", endereco: "Av. Mostardeiros, 3213 – Salas 1 e 2" },
  "195": { cidade: "SANTA MARIA", endereco: "Av. Presidente Vargas, 2194" },
  "196": { cidade: "TAPES", endereco: "Av. Assis Brasil, 412" },
  "197": { cidade: "QUARAI", endereco: "Avenida Sete de Setembro, nº 775" },
  "199": { cidade: "CAXIAS DO SUL", endereco: "Rua Borges de Medeiros, 391– Lj 3/4" },
  "301": { cidade: "CAXIAS DO SUL", endereco: "Rodovia RSC 453, KM 3,5 - nº 2780, loja 159" },
  "302": { cidade: "RIO GRANDE", endereco: "Av. Rio Grande, 251" },
  "303": { cidade: "RIO GRANDE", endereco: "Avenida Presidente Vargas, 687" },
  "304": { cidade: "RIO GRANDE", endereco: "Rua Doutor Nascimento, 389, 391 e 399" },
  "124": { cidade: "XANGRILA", endereco: "Av. Paraguassú, 4561" },
  "306": { cidade: "XANGRILA", endereco: "Av. Paraguassú, 1214, Loja 1" },
  "307": { cidade: "PORTO ALEGRE", endereco: "Av. Assis Brasil, 2611 - Sala 102" },
  "308": { cidade: "PORTO ALEGRE", endereco: "Rua José de Alencar, nº 286, Sala 05, bairro Menino Deus" },
  "309": { cidade: "PELOTAS", endereco: "Avenida Dom Joaquim, 680" },
  "310": { cidade: "PORTO ALEGRE", endereco: "Rua Vicente da Fontoura, 2759" },
  "311": { cidade: "PORTO ALEGRE", endereco: "Rua Casemiro de Abreu, 1755 - e 1775" },
  "312": { cidade: "PORTO ALEGRE", endereco: "Rua Marquês do pombal, 565 - Moinhos de Vento" },
  "313": { cidade: "PORTO ALEGRE", endereco: "Avenida Wenceslau Escobar, 1933 - Cristal" },
  "314": { cidade: "PELOTAS", endereco: "Rua Visconde de Ouro Preto, 46 - Areal" },
  "315": { cidade: "OSORIO", endereco: "Av. Paraguassú, 444" },
  "319": { cidade: "SANTA CRUZ DO SUL", endereco: "Rua Thomaz Flores, 206" },
  "321": { cidade: "PELOTAS", endereco: "Avenida Ferreira Viana, 1526 - Lojas 4, 5 e 6" },
  "322": { cidade: "PORTO ALEGRE", endereco: "Avenida Guaporé, nº 324" },
  "323": { cidade: "PORTO ALEGRE", endereco: "Avenida Cristóvão Colombo, 2999" },
  "324": { cidade: "PORTO ALEGRE", endereco: "Avenida Protásio Alves, 2121" },
  "325": { cidade: "NOVO HAMBURGO", endereco: "Rua Bento Gonçalves, 2917 - Lojas 1 e 2" },
  "326": { cidade: "PORTO ALEGRE", endereco: "Avenida Nilo Peçanha, 3200 - Lojas 48 e 49" },
  "327": { cidade: "SANTA MARIA", endereco: "Avenida Rio Branco, n° 533" },
  "330": { cidade: "PORTO ALEGRE", endereco: "Avenida Nilo Peçanha, 95 - Loja A" },
  "333": { cidade: "SAO LEOPOLDO", endereco: "Avenida João Correa, 532" },
  "334": { cidade: "BALNEÁRIO PINHAL", endereco: "Rua Humberto de Alencar Castelo Branco, 374 - Ljs 3 e 4" },
  "335": { cidade: "SANTA MARIA", endereco: "Rua General Neto, 1097" },
  "336": { cidade: "CAXIAS DO SUL", endereco: "Avenida Rio Branco, 425 - Lojas 102 e 103" },
  "337": { cidade: "PELOTAS", endereco: "Avenida Dom Joaquim, nº 603 - Loja 1" },
  "338": { cidade: "PASSO FUNDO", endereco: "Rua Quinze de Novembro, 318" },
  "340": { cidade: "OSORIO", endereco: "Avenida Getúlio Vargas, nº 525" },
  "341": { cidade: "CAPAO DA CANOA", endereco: "Av. Paraguassú, 2786" },
  "343": { cidade: "PORTO ALEGRE", endereco: "Rua Valparaíso, 698" },
  "344": { cidade: "PORTO ALEGRE", endereco: "Av. Plínio Brasil Milano, 1689 - Loja 101" },
  "345": { cidade: "PELOTAS", endereco: "Rua Gonçalves Chaves, 2920" },
  "346": { cidade: "BAGE", endereco: "Avenida Tupy Silveira, 1887 - Sala 01" },
  "347": { cidade: "PORTO ALEGRE", endereco: "Avenida Edgar Pires de Castro, 1395" },
  "348": { cidade: "ARROIO GRANDE", endereco: "Rua Visconde de Mauá, 431" },
  "349": { cidade: "PORTO ALEGRE", endereco: "Avenida Doutor Nilo Peçanha, 690" },
  "350": { cidade: "PORTO ALEGRE", endereco: "Rua dos Andradas, 1480" },
  "351": { cidade: "PORTO ALEGRE", endereco: "Avenida Juca Batista, 4255 - SUC 128" },
  "352": { cidade: "URUGUAIANA", endereco: "Rua Quinze de Novembro, 2.755" },
  "353": { cidade: "CAXIAS DO SUL", endereco: "Rua Tronca, 2730" },
  "354": { cidade: "SANTA ROSA", endereco: "Avenida Expedicionário Weber, 805" },
  "355": { cidade: "TORRES", endereco: "Rua Bento Gonçalves, 81" },
  "356": { cidade: "IJUI", endereco: "Rua Doutor Pestana, 20" },
  "357": { cidade: "PORTO ALEGRE", endereco: "Rua Paraguai, 100 loja 104 , Rio Branco" },
  "358": { cidade: "CAXIAS DO SUL", endereco: "Rua Professor Marcos Martini, 480" },
  "359": { cidade: "SANTA MARIA", endereco: "Avenida Nossa Senhora Medianeira, 1318" },
  "360": { cidade: "URUGUAIANA", endereco: "Avenida Presidente Getúlio Vargas, 3307" },
  "361": { cidade: "CARLOS BARBOSA", endereco: "Rua Buarque de Macedo, 3867" },
  "362": { cidade: "ESTEIO", endereco: "Avenida Presidente Vargas, 2358 - Lojas 1 e 2" },
  "363": { cidade: "CAPAO DA CANOA", endereco: "Rua Sepé, 1931" },
  "364": { cidade: "GRAMADO", endereco: "Avenida das Hortênsias, nº 3.860" },
  "365": { cidade: "CANGUÇU", endereco: "Rua General Osório, 1099" },
  "366": { cidade: "GRAMADO", endereco: "Av. das Hortênsias, 1929 - Loja 101" },
  "367": { cidade: "PELOTAS", endereco: "Avenida Ferreira Viana, nº 476" },
  "368": { cidade: "TRAMANDAI", endereco: "Rua Rubem Berta, 1445" },
  "369": { cidade: "PORTO ALEGRE", endereco: "Avenida do Forte, 1396 - Loja 1" },
  "370": { cidade: "GUAIBA", endereco: "Rua Sete de Setembro, 360" },
  "371": { cidade: "DOIS IRMÃOS", endereco: "Avenida 25 de Julho, nº 785" },
  "373": { cidade: "VACARIA", endereco: "Rua Julio de Castilhos, nº 1.063" },
  "374": { cidade: "PORTO ALEGRE", endereco: "Rua Santana, nº 1501, loja 1" },
  "375": { cidade: "LAJEADO", endereco: "Avenida Benjamin Constant, nº 1.707" },
  "376": { cidade: "PORTO ALEGRE", endereco: "Avenida Cavalhada, nº 2351, 2369 e 2373" },
  "378": { cidade: "PORTO ALEGRE", endereco: "Av. Teresópolis, 3487" },
  "379": { cidade: "FLORES DA CUNHA", endereco: "Rua Borges de Medeiros, nº 1.461, salas 01 e 02" },
  "382": { cidade: "GRAVATAÍ", endereco: "Avenida Dorival Cândido Luz de Oliveira, nº 680" },
  "383": { cidade: "PORTO ALEGRE", endereco: "Rua Vinte e Quatro de Outubro, 1.465" },
  "384": { cidade: "IVOTI", endereco: "Avenida Presidente Lucena, nº 3.040, loja 03" },
  "386": { cidade: "CAXIAS DO SUL", endereco: "Rua General Malett, 56" },
  "387": { cidade: "CANOAS", endereco: "Avenida Farroupilha, nº 4.545, loja 2.078, Pavimento L2" },
  "389": { cidade: "ELDORADO DO SUL", endereco: "Avenida Getulio Vargas, 274" },
  "390": { cidade: "LAGOA VERMELHA", endereco: "Av. Afonso Pena, 630 sala 14" },
  "392": { cidade: "PORTO ALEGRE", endereco: "Avenida Panamericana, 670" },
  "393": { cidade: "MONTENEGRO", endereco: "Rua José Luiz, nº 1.485" },
  "394": { cidade: "IBIRUBA", endereco: "Rua General Osório, nº 878, sala 01" },
  "395": { cidade: "PASSO FUNDO", endereco: "Avenida Presidente Vargas, 1610 lojas 2004,2005,2006 e 2007" },
  "396": { cidade: "SÃO BORJA", endereco: "Rua General Marques, nº 902, Loja 1" },
  "397": { cidade: "PORTO ALEGRE", endereco: "Rua Sarmento Leite n°876, ljs 880 e 882" },
  "398": { cidade: "SAPUCAIA DO SUL", endereco: "Rua Professor Francisco Brochado da Rocha, nº 393" },
  "399": { cidade: "CANELA", endereco: "Rua João Pessoa, 192" },
  "400": { cidade: "NOVO HAMBURGO", endereco: "Av. Dr. Maurício Cardoso, 833 - Sl 102" },
  "401": { cidade: "PORTO ALEGRE", endereco: "Rua dos Andradas, 914" },
  "403": { cidade: "CAXIAS DO SUL", endereco: "Rua Alfredo Chaves, 1332 – Suc 001 – Zaffari" },
  "404": { cidade: "SAPIRANGA", endereco: "Rua João Corrêa, 1193" },
  "405": { cidade: "SAO LEOPOLDO", endereco: "Av. Primeiro de Março, 821 – Suc 215" },
  "406": { cidade: "CAXIAS DO SUL", endereco: "Rua Sinimbu, 135 SUC 003" },
  "408": { cidade: "PORTO ALEGRE", endereco: "Coronel Bordini, 12" },
  "411": { cidade: "CAMPO BOM", endereco: "Av. Brasil, 3057" },
  "412": { cidade: "CANELA", endereco: "Rua Júlio de Castilhos, 509" },
  "414": { cidade: "PORTO ALEGRE", endereco: "Av. Getúlio Vargas, 1714" },
  "415": { cidade: "PORTO ALEGRE", endereco: "Rua Fernandes Vieira, 401 – suc 102" },
  "416": { cidade: "NOVA PETROPOLIS", endereco: "Av. Quinze de Novembro, 1150 – Lj 02" },
  "417": { cidade: "PASSO FUNDO", endereco: "Av. Presidente Vargas, 895" },
  "421": { cidade: "SANTA MARIA", endereco: "Rua Marechal Floriano, 1000 - Lj Térreo" },
  "425": { cidade: "ARROIO DO SAL", endereco: "Av. Assis Brasil, 420" },
  "427": { cidade: "CHARQUEADAS", endereco: "Rua Bento Gonçalves, 691" },
  "429": { cidade: "BENTO GONCALVES", endereco: "Rua José Mário Mônaco, 333, loja 102" },
  "430": { cidade: "GARIBALDI", endereco: "Avenida Independência, nº 195, sala comercial 1" },
  "431": { cidade: "GRAMADO", endereco: "Av. Borges de Medeiros, 1419 - Lj 01" },
  "432": { cidade: "ESTANCIA VELHA", endereco: "Rua Presidente Lucena, 3417" },
  "439": { cidade: "VIAMAO", endereco: "Av. Placido Mottin, n° 1325" },
  "440": { cidade: "PORTO ALEGRE", endereco: "Av. Ipiranga, 6681 Prédio 12B - Térreo" },
  "441": { cidade: "PORTO ALEGRE", endereco: "Rua Ladislau Neto, nº 595" },
  "442": { cidade: "PORTO ALEGRE", endereco: "Avenida Osvaldo Aranha, 1382" },
  "455": { cidade: "PORTO ALEGRE", endereco: "Rua Vinte e Quatro de Outubro, 722" },
  "456": { cidade: "PORTO ALEGRE", endereco: "Av. Diário de Notícias, 300 - Lj 1004" },
  "460": { cidade: "SANTA MARIA", endereco: "Rua Euclides da Cunha, nº 1.607, bairro Nossa Senhora das Dores" },
  "461": { cidade: "SAO LEOPOLDO", endereco: "Rua Lindolfo Collor, nº 660, bairro Centro" },
  "462": { cidade: "GUAIBA", endereco: "Rua São José, 546" },
  "463": { cidade: "SANTANA DO LIVRAMENTO", endereco: "Rua dos Andradas, 16 e 20" },
  "464": { cidade: "PORTO ALEGRE", endereco: "Avenida Cavalhada, nº 3.860" },
  "465": { cidade: "PORTO ALEGRE", endereco: "Avenida Sertório, 8000 - Sala 208" },
  "468": { cidade: "RIO GRANDE", endereco: "Rua Visconde do Paranaguá, 43" },
  "469": { cidade: "RIO GRANDE", endereco: "Dr. Napoleão Laureano, 517 Loja 01" },
  "470": { cidade: "RIO GRANDE", endereco: "Avenida Rio Grande, 79 Loja 11" },
  "471": { cidade: "PELOTAS", endereco: "Largo Portugal, 1155 Loja 09" },
  "476": { cidade: "CAPAO DA CANOA", endereco: "Av. Paraguassú, 2043" },
  "477": { cidade: "PELOTAS", endereco: "Avenida Adolfo Fetter, 3300, Lj 01- Recanto de Portugal - Praia" },
  "478": { cidade: "VIAMAO", endereco: "Av. Cel. Marcos de Andrade, 141, Lojas 104 e 105, Sobrelojas 204 e 205" },
  "482": { cidade: "RIO GRANDE", endereco: "Av Joao Oliveira, 1, Bairro Parque Residencial Jardim Do Sol" },
  "483": { cidade: "PORTO ALEGRE", endereco: "Rua Padre Chagas, 217" },
  "484": { cidade: "SANTA MARIA", endereco: "Rua Doutor Bozano, 973, loja 07" },
  "485": { cidade: "PASSO FUNDO", endereco: "Avenida General Netto, 170 - Edifício JB Estacia" },
  "486": { cidade: "PORTO ALEGRE", endereco: "Rua Anita Garibaldi, 600 - Loja 101" },
  "487": { cidade: "PORTO ALEGRE", endereco: "Av. Wenceslau Escobar, n° 1286 - SUC 11" },
  "488": { cidade: "BAGE", endereco: "Avenida Tupy Silveira, 1401" },
  "492": { cidade: "PASSO FUNDO", endereco: "Rua Paissandú, 1343" },
  "493": { cidade: "PELOTAS", endereco: "Avenida Almirante Barroso, 2098" },
  "495": { cidade: "NOVO HAMBURGO", endereco: "Avenida Doutor Maurício Cardoso, 1670, lojas 1, 2 e 3" },
  "496": { cidade: "PORTO ALEGRE", endereco: "Rua Vicente da Fontoura, nº 1.676" },
  "498": { cidade: "CANOAS", endereco: "Avenida Santos Ferreira, 1400" },
  "499": { cidade: "RIO GRANDE", endereco: "Rua Jockey Clube, 155, Loja 48" },
  "701": { cidade: "PORTO ALEGRE", endereco: "Av. Cristóvão Colombo, 976/980, 564 e 572" },
  "702": { cidade: "PORTO ALEGRE", endereco: "Rua Anita Garibaldi, 2099 – Lj 02" },
  "703": { cidade: "CACHOEIRINHA", endereco: "Av. General Flores da Cunha, 1233 loja 2" },
  "705": { cidade: "CACHOEIRINHA", endereco: "Av. General Flores da Cunha, 4315" },
  "706": { cidade: "VIAMAO", endereco: "Avenida Liberdade, nº 1.553" },
  "707": { cidade: "CANOAS", endereco: "Avenida Doutor Sezefredo Azambuja Vieira, nº 907 e 901, loja 4 e loja 5" },
  "708": { cidade: "VENANCIO AIRES", endereco: "Rua Osvaldo Aranha, nº 1.477" },
  "709": { cidade: "SANTO ANTONIO DA PATRULHA", endereco: "Rua Coronel Victor Villa Verde, 250" },
  "712": { cidade: "CRUZ ALTA", endereco: "Rua Barão do Rio Branco, 1484" },
  "713": { cidade: "TAQUARA", endereco: "Rua General Frota, 2580, loja 02" },
  "714": { cidade: "CAXIAS DO SUL", endereco: "Rua Ernesto Alves, 1405" },
  "716": { cidade: "CAXIAS DO SUL", endereco: "Rua Visconde de Pelotas, 819" },
  "717": { cidade: "IJUI", endereco: "Rua Bento Gonçalves, 415, bairro Centro" },
  "718": { cidade: "VERANÓPOLIS", endereco: "Rua Júlio de Castilhos, 818 loja 03" },
  "721": { cidade: "TEUTONIA", endereco: "Rua Três de Outubro, nº 371, bairro Languiru" },
  "722": { cidade: "XANGRILA", endereco: "Avenida Paraguassu, nº 2.255, bairro Centro" },
  "723": { cidade: "XANGRILA", endereco: "Rua Água Marinha, 1421" },
  "726": { cidade: "PORTO ALEGRE", endereco: "Avenida Assis Brasil, 5.451 - 5.431, bairro Sarandi" },
  "727": { cidade: "PELOTAS", endereco: "Rua Gonçalves Chaves, 483, bairro Centro" },
  "728": { cidade: "SOLEDADE", endereco: "Avenida Marcehal Floriano Peixoto, 965" },
  "729": { cidade: "CAXIAS DO SUL", endereco: "Rua Coronel Flores" },
  "730": { cidade: "PELOTAS", endereco: "Rua Santos Dumont, n° 770" },
  "731": { cidade: "PORTO ALEGRE", endereco: "Rua Professor Annes Dias, 135- Sala no andar Térreo - Hospital Santa Clara" },
  "732": { cidade: "BENTO GONCALVES", endereco: "R SALDANHA MARINHO, 110 - SALA 01" },
  "733": { cidade: "PORTO ALEGRE", endereco: "Rua Silveiro, 181" },
  "736": { cidade: "FARROUPILHA", endereco: "Rua Treze de maio, 585" },
  "737": { cidade: "CANOAS", endereco: "Av. Santos Ferreira, 641" },
  "738": { cidade: "SANTA CRUZ DO SUL", endereco: "Rua Vinte e Oito de Setembro, 585" },
  "739": { cidade: "CANOAS", endereco: "Av. Boqueirão - 1721" },
  "740": { cidade: "NOVA PRATA", endereco: "Av. Presidente Vargas, nº 1.148, bairro Centro" },
  "741": { cidade: "PORTO ALEGRE", endereco: "Rua Dona Adda Mascarenhas de Moraes, nº 57" },
  "743": { cidade: "BENTO GONCALVES", endereco: "Rua General Osorio ,235" },
  "744": { cidade: "BENTO GONCALVES", endereco: "Rua Guilherme Fasolo, n° 987" },
  "747": { cidade: "BENTO GONCALVES", endereco: "Rua Treze de Maio, nº 877, Lojas 102 e 103" },
  "748": { cidade: "PORTO ALEGRE", endereco: "Avenida Goethe, nº 210, bairro Rio Branco" },
  "749": { cidade: "IMBE", endereco: "Avenida Paraguassu, n°2966, centro" },
  "750": { cidade: "Camaqua", endereco: "Rua Bento Gonçalves, 1032" },
  "751": { cidade: "PASSO FUNDO", endereco: "Avenida Presidente Vargas n°75, bairro Vila Rodrigues" },
  "752": { cidade: "NOVO HAMBURGO", endereco: "Rua Bartolomeu Gusmão, 303 - Canudos" },
  "753": { cidade: "ALEGRETE", endereco: "Avenida Dr. Lauro Dorneles, 01" },
  "756": { cidade: "IJUI", endereco: "Rua Mato Grosso, 17" },
  "758": { cidade: "CAXIAS DO SUL", endereco: "Rua João Venzon Netto, 67" },
  "759": { cidade: "SANTANA DO LIVRAMENTO", endereco: "Av. Presidente João Belchior Goulart, 841" },
  "760": { cidade: "CAMPO BOM", endereco: "Avenida Brasil, 2630" },
  "762": { cidade: "SANTA MARIA", endereco: "Avenida Nossa Senhora Medianeira, 2073" },
  "763": { cidade: "SANTO ANGELO", endereco: "Rua Sete de Setembro, 538" },
  "766": { cidade: "PASSO FUNDO", endereco: "Avenida Brasil Oeste, 02" },
  "767": { cidade: "PORTO ALEGRE", endereco: "Rua Pedro Ivo , 844" },
  "768": { cidade: "SÃO BORJA", endereco: "Rua Andradas 2161, Centro" },
  "769": { cidade: "ERECHIM", endereco: "Av. Sete de Setembro, 665" },
  "771": { cidade: "SÃO GABRIEL", endereco: "Rua Mascarenhas de Moraes, nº 290" },
  "775": { cidade: "CACHOEIRA DO SUL", endereco: "Rua Sete de Setembro, 1536" },
  "776": { cidade: "PORTO ALEGRE", endereco: "Av. Praia de Belas 1720" },
  "777": { cidade: "URUGUAIANA", endereco: "Rua quinze de novembro, 1782" },
  "778": { cidade: "PORTO ALEGRE", endereco: "Av. coronel aparicio borges, 250 loja 216" },
  "779": { cidade: "PORTO ALEGRE", endereco: "Avenida Panamericana, 240" },
  "780": { cidade: "CAXIAS DO SUL", endereco: "Rua São José,2089" },
  "781": { cidade: "IGREJINHA", endereco: "Rua General Ernesto Dornelles, 456" },
  "782": { cidade: "GRAVATAÍ", endereco: "Avenida Ely Correa, 759" },
  "783": { cidade: "PORTO ALEGRE", endereco: "Avenida Protásio Alves, nº 7.005" },
  "784": { cidade: "NOVO HAMBURGO", endereco: "Rua Marcílio Dias, nº 2.085" },
  "786": { cidade: "PORTO ALEGRE", endereco: "Avenida Protasio Alves,8323" },
  "787": { cidade: "PAROBE", endereco: "Rua Dr. Legendre, nº 310" },
  "789": { cidade: "BAGE", endereco: "Rua Tupy Silveira, 2399" },
  "790": { cidade: "PASSO FUNDO", endereco: "Av. Brasil Oeste, 1347" },
  "792": { cidade: "BENTO GONCALVES", endereco: "Rua Fortaleza, 356" },
  "794": { cidade: "Camaqua", endereco: "Rua Presidente Vargas, nº 744, bairro Centro" },
  "795": { cidade: "URUGUAIANA", endereco: "Rua Domingos de Almeida, nº 2.291, bairro Centro" },
  "796": { cidade: "SANTA CRUZ DO SUL", endereco: "Avenida Deputado Euclydes Nicolau Kliemann, nº 721, bairro Ana Nery" },
  "797": { cidade: "NOVO HAMBURGO", endereco: "Rua Joaquim Pedro Soares, nº 907" },
  "798": { cidade: "CAXIAS DO SUL", endereco: "Rua Treze de Maio, nº 996, bairro Cristo Redentor" },
  "820": { cidade: "SANTA MARIA", endereco: "Avenida Borges de Medeiros, nº 1.955" },
  "821": { cidade: "ALVORADA", endereco: "Avenida Presidente Getúlio Vargas, nº 321" },
  "824": { cidade: "SANTA MARIA", endereco: "Avenida Prefeito Evandro Behr, nº 6.665" },
  "826": { cidade: "PORTO ALEGRE", endereco: "Praça Lima Duarte, nº 09 – Loja 1" },
  "828": { cidade: "PORTO ALEGRE", endereco: "R Silva Jardim, 277" },
  "829": { cidade: "PORTO ALEGRE", endereco: "Avenida Coronel Marcos, nº 2.523, bairro Pedra Redonda" },
  "830": { cidade: "PORTO ALEGRE", endereco: "R. Antônio Carlos Berta,151 loja 03" },
  "831": { cidade: "PORTO ALEGRE", endereco: "Av. Icaraí, 1440" },
  "832": { cidade: "RIO GRANDE", endereco: "Rua Val Porto, nº 393, bairro Parque Residencial Salgado Filho" },
  "833": { cidade: "GRAVATAÍ", endereco: "Av Dorival Candido Luz de Oliveira, 3527 Bairro São Jeronimo" },
  "834": { cidade: "CAXIAS DO SUL", endereco: "Av. Bom Pastor, 477" },
  "835": { cidade: "NOVA PETROPOLIS", endereco: "Avenida Quinze de Novembro, nº 1.389 – Loja 1" },
  "836": { cidade: "IMBE", endereco: "Av Paraguassu, 7088" },
  "837": { cidade: "LAJEADO", endereco: "R Saldanha Marinho, 359" },
  "838": { cidade: "PORTO ALEGRE", endereco: "Av. BENTO GONCALVES, n° 1313" },
  "839": { cidade: "BENTO GONCALVES", endereco: "AV OSVALDO ARANHA, 740" },
  "840": { cidade: "LAJEADO", endereco: "Av. Sen. Alberto Pasqualini , 1605" },
  "842": { cidade: "CAXIAS DO SUL", endereco: "Rua Bortolo Zani, 760" },
  "843": { cidade: "PORTO ALEGRE", endereco: "Av Grecia, 789, Bairro Passo Da Areia" },
  "845": { cidade: "Canoas", endereco: "Rua Frederico Guilherme Ludwig, nº 370 – Loja 01" },
  "848": { cidade: "VENANCIO AIRES", endereco: "Rua 15 de Novembro, 1321" },
  "853": { cidade: "TRAMANDAI", endereco: "Av Fernandes Bastos, 857" },
  "855": { cidade: "PORTO ALEGRE", endereco: "Avenida Coronel Lucas de Oliveira 740" },
  "858": { cidade: "GRAVATAÍ", endereco: "R Doutor Luiz Bastos Do Prado, 1888" },
  "859": { cidade: "PELOTAS", endereco: "R Rafael Pinto Bandeira, 1376" },
  "864": { cidade: "ENCANTADO", endereco: "R Julio De Castilhos, 1304" },
  "867": { cidade: "CANOAS", endereco: "AV. DOUTOR SEZEFREDO AZAMBUJA VIEIRA, 2349" },
  "868": { cidade: "PORTO ALEGRE", endereco: "Av Economista Nilo Wulff, 215" },
  "869": { cidade: "OSÓRIO", endereco: "R Manoel Marques Da Rosa, 1077" },
  "870": { cidade: "SAO LEOPOLDO", endereco: "Av Feitoria, 4355" },
  "875": { cidade: "TAPEJARA", endereco: "Av. Sete de Setembro, 1205" },
  "876": { cidade: "PORTO ALEGRE", endereco: "AV. JUCA BATISTA, 4381" },
  "877": { cidade: "PORTO ALEGRE", endereco: "R Portugal, 691" },
  "878": { cidade: "MARAU", endereco: "R Bento Goncalves, 725" },
  "879": { cidade: "FARROUPILHA", endereco: "R Quatorze De Julho, 202" },
  "880": { cidade: "PORTO ALEGRE", endereco: "Av Ijui, 160" },
  "881": { cidade: "NÃO-ME-TOQUE", endereco: "Av Alto Do Jacui, 504" },
  "883": { cidade: "GRAMADO", endereco: "Av. Das Hortensias, 880" },
  "884": { cidade: "SANTA ROSA", endereco: "Av Santa Cruz, 1049" },
  "885": { cidade: "PORTO ALEGRE", endereco: "Av Plinio Brasil Milano, 1313" },
  "887": { cidade: "PORTO ALEGRE", endereco: "Avenida Ipiranga, 7624 - Loja 01" },
  "888": { cidade: "PORTO ALEGRE", endereco: "Rua Barão do Amazonas, 716" },
  "889": { cidade: "CACHOEIRINHA", endereco: "Av General Flores Da Cunha, 1546" },
  "891": { cidade: "PORTO ALEGRE", endereco: "Av. Severo Dullius, n° 90.010 – LUC T1N2046 – Terminal" },
  "894": { cidade: "CAPAO DA CANOA", endereco: "Avenid Paraguassu, 690" },
  "896": { cidade: "DOIS IRMÃOS", endereco: "Av Sao Miguel, 854" },
  "897": { cidade: "NOVO HAMBURGO", endereco: "Rua Ícaro, 1810" },
  "899": { cidade: "TORRES", endereco: "Av Benjamin Constant, 681" },
  "912": { cidade: "PORTO ALEGRE", endereco: "Rua Felipe De Oliveira, 465" },
  "913": { cidade: "FLORES DA CUNHA", endereco: "R Doutor Montaury, 617" },
  "914": { cidade: "PORTO ALEGRE", endereco: "R Tomaz Gonzaga, 320" },
  "915": { cidade: "GUAÍBA", endereco: "Av Nestor De Moura Jardim, 680" },
  "920": { cidade: "TRÊS COROAS", endereco: "R 12 De Maio, 234" },
  "922": { cidade: "PORTO ALEGRE", endereco: "Avenida Rodrigues da Fonseca, 1509 - Loja 06" },
  "926": { cidade: "RIO GRANDE", endereco: "Avenida Rio Grande, n° 551, bairro Cassino" },
  "927": { cidade: "CAXIAS DO SUL", endereco: "RUA DOM JOSE BAREA, Nº 1888 - BAIRRO: EXPOSICAO" },
  "928": { cidade: "PASSO FUNDO", endereco: "Av Brasil Leste, 610" },
  "930": { cidade: "SANTIAGO", endereco: "Rua Sete De Setembro, 226" },
  "934": { cidade: "GRAVATAI", endereco: "Avenida Jose Loureiro Da Silva, N° 2663, Bairro Centro" },
  "936": { cidade: "PORTO ALEGRE", endereco: "Rua Quintino Bocaiuva, n° 483" },
  "937": { cidade: "ERECHIM", endereco: "Avenida Jose Oscar Salazar, 307" },
  "942": { cidade: "BENTO GONCALVES", endereco: "Rua Guilherme Fasolo, n° 987" },
  "943": { cidade: "CARAZINHO", endereco: "Av Pátrica ,600" },
  "944": { cidade: "SANTA MARIA", endereco: "Rua Dezessete de Maio, 430" },
  "945": { cidade: "SANTA CRUZ DO SUL", endereco: "Coronel Oscar Rafael Jost, 680" },
  "946": { cidade: "Panambi", endereco: "R.Sete de Setembro ,211" },
  "999": { cidade: "Eldorado do Sul", endereco: "PANVEL MATRIZ EDS" },
  "1002": { cidade: "Eldorado do Sul", endereco: "Avenida Industrial Belgraf, 865" },
  "1021": { cidade: "Eldorado do Sul", endereco: "AV Julio Ricardo Mottin, 400 - Bairro: Industrial" }
};

const getBranchInfo = (ident: string) => {
  // Extract numbers from something like "Filial 1" or "001"
  const idNum = ident.replace(/\D/g, '').replace(/^0+/, '');
  return FILIAIS[idNum] || null;
};

// --- Utils ---
const conv = (h: string) => {
  if (!h) return null;
  const [H, M] = h.split(':').map(Number);
  return H * 60 + M;
};

const fmt = (min: number) => {
  const H = Math.floor(min / 60);
  const M = min % 60;
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
};

export default function App() {
  // --- State ---
  const [qtd, setQtd] = useState(0);
  const [filial, setFilial] = useState('');

  const [actions, setActions] = useState<Actions>({
    alterarHorario: false,
    baixaFarma: false,
    inclusaoFarma: false,
  });

  const [baixaDetails, setBaixaDetails] = useState<BaixaDetails>({
    nome: '',
    motivo: 'Desligamento',
    filialDestino: '',
  });

  const [abertura, setAbertura] = useState<ScheduleRow>({
    seg: '', ter: '', qua: '', qui: '', sex: '', sab: '', dom: ''
  });
  const [fechamento, setFechamento] = useState<ScheduleRow>({
    seg: '', ter: '', qua: '', qui: '', sex: '', sab: '', dom: ''
  });

  const initialScheduleRow = (): ScheduleRow => ({
    seg: '', ter: '', qua: '', qui: '', sex: '', sab: '', dom: ''
  });

  const [showDownloadPopup, setShowDownloadPopup] = useState(false);
  const [downloadedFiles, setDownloadedFiles] = useState<string[]>([]);
  const [downloadHasNewHiring, setDownloadHasNewHiring] = useState(false);

  // Popup de assinatura (só para Transferidos)
  const [showSignPopup, setShowSignPopup] = useState(false);
  // Guarda { nome: string, bytes: Uint8Array }[] dos PDFs de declaração prontos para assinar ou baixar
  const [pendingDecPdfs, setPendingDecPdfs] = useState<{ nome: string; bytes: Uint8Array }[]>([]);

  const [pharmacists, setPharmacists] = useState<Pharmacist[]>(
    Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      nome: '',
      cpf: '',
      crf: '',
      dataNascimento: '',
      tipoInclusao: 'Já vinculado',
      filialOrigem: '',
      entrada: initialScheduleRow(),
      intervalo: initialScheduleRow(),
      retorno: initialScheduleRow(),
      saida: initialScheduleRow(),
    }))
  );

  const [validationResult, setValidationResult] = useState<{
    text: string;
    type: 'idle' | 'success' | 'error' | 'warning';
    canGeneratePdf: boolean;
    totalHours: number[];
  }>({
    text: '',
    type: 'idle',
    canGeneratePdf: false,
    totalHours: [],
  });

  // Controle de foco na tabela de horários
  const [focusedFarmaId, setFocusedFarmaId] = useState<number | null>(null);

  // Mobile mode
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [mobileTab, setMobileTab] = useState<'config' | 'filial' | 'farma' | 'validar'>('config');
  const [mobileFarmaIdx, setMobileFarmaIdx] = useState(0);

  // --- Effects ---
  useEffect(() => {
    // Reset state if input changes
    setValidationResult(prev => ({ 
      ...prev, 
      canGeneratePdf: false, 
      text: prev.text ? "⚠️ Alteração detectada. Valide novamente para baixar." : "",
      type: prev.text ? 'warning' : 'idle'
    }));
  }, [qtd, filial, actions, baixaDetails, abertura, fechamento, pharmacists]);

  const isStep1Done = filial.trim().length > 0;
  const isStep2Done = actions.alterarHorario || actions.baixaFarma || actions.inclusaoFarma;
  const isStep3Done = qtd > 0;
  const isEverythingUnlocked = isStep1Done && isStep2Done && isStep3Done;

  // Horário da filial preenchido em pelo menos 1 dia (abertura E fechamento)
  const isFilialHoraOk = DAYS.some(d => abertura[d] !== '' && fechamento[d] !== '');

  // Por farmacêutico: desbloqueio progressivo
  const isFarmaNomeOk = (fIdx: number) => {
    // F1: filial + ação + qtd + horário filial ok
    if (fIdx === 0) return isEverythingUnlocked && isFilialHoraOk;
    // FN>1: anterior tem nome+cpf+nasc+crf E pelo menos 1 dia com entrada E saída
    const prev = pharmacists[fIdx - 1];
    const prevHasEntradaSaida = DAYS.some(d => prev.entrada[d] !== '' && prev.saida[d] !== '');
    return (
      prev.nome.trim() !== '' &&
      prev.cpf.trim() !== '' &&
      prev.dataNascimento.trim() !== '' &&
      prev.crf.trim() !== '' &&
      prevHasEntradaSaida
    );
  };

  const isFarmaCpfNascOk = (fIdx: number) => {
    const f = pharmacists[fIdx];
    return isFarmaNomeOk(fIdx) && f.nome.trim() !== '';
  };

  // Libera CRF após CPF + Nascimento preenchidos
  const isFarmaCrfOk = (fIdx: number) => {
    const f = pharmacists[fIdx];
    return isFarmaCpfNascOk(fIdx) && f.cpf.trim() !== '' && f.dataNascimento.trim() !== '';
  };

  // Libera horários após Nome + CPF + Nascimento + CRF preenchidos
  const isFarmaScheduleOk = (fIdx: number) => {
    const f = pharmacists[fIdx];
    return isFarmaCrfOk(fIdx) && f.crf.trim() !== '';
  };

  // --- Handlers ---
  const handleCopyRow = (row: ScheduleRow, setter: (val: ScheduleRow) => void) => {
    const val = row.seg;
    if (val) {
      setter({
        seg: val, ter: val, qua: val, qui: val, sex: val, sab: val, dom: val
      });
    }
  };

  const handleCopyFarmaRow = (farmaId: number, field: keyof Pharmacist, day: Day) => {
    setPharmacists(prev => prev.map(f => {
      if (f.id === farmaId) {
        const row = f[field] as ScheduleRow;
        const val = row[day];
        if (val) {
          const newRow = { seg: val, ter: val, qua: val, qui: val, sex: val, sab: val, dom: val };
          return { ...f, [field]: newRow };
        }
      }
      return f;
    }));
  };

  const updatePharmacist = useCallback((id: number, updates: Partial<Pharmacist>) => {
    setPharmacists(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const updateFarmaSchedule = useCallback((id: number, field: 'entrada' | 'intervalo' | 'retorno' | 'saida', day: Day, val: string) => {
    setPharmacists(prev => prev.map(f => {
      if (f.id === id) return { ...f, [field]: { ...f[field], [day]: val } };
      return f;
    }));
  }, []);

  const validarSemana = () => {
    let totalHours = Array(qtd).fill(0);
    let alertasCli: string[] = [];
    let avisosAmarelos: string[] = [];
    let lacunasGerais: string[] = [];

    // Transfer checks
    const transferErrors: string[] = [];
    if (actions.inclusaoFarma) {
      pharmacists.slice(0, qtd).forEach(f => {
        if (f.tipoInclusao === 'Transferido') {
          if (!f.filialOrigem.trim()) {
            transferErrors.push(`F${f.id}: Informe a Filial de Origem para inclusão por transferência.`);
          }
          if (!f.crf.trim()) {
            transferErrors.push(`F${f.id}: Informe o CRF/RS para inclusão por transferência.`);
          }
        }
      });
    }

    DAYS.forEach(d => {
      const openTime = conv(abertura[d]);
      let closeTime = conv(fechamento[d]);

      if (openTime !== null && closeTime !== null) {
        if (closeTime === 0) closeTime = 1440;
        const rangeFechamento = (closeTime < openTime) ? closeTime + 1440 : closeTime;
        const minutosCobertos = new Array(rangeFechamento - openTime).fill(0);

        for (let pIdx = 0; pIdx < qtd; pIdx++) {
          const f = pharmacists[pIdx];
          const e = conv(f.entrada[d]);
          const i = conv(f.intervalo[d]);
          const r = conv(f.retorno[d]);
          let s = conv(f.saida[d]);

          if (e !== null && s !== null) {
            if (s === 0) s = 1440;
            const sEfetiva = (s < e) ? s + 1440 : s;
            const jornadaBruta = sEfetiva - e;
            const pI = (i !== null) ? i : -1;
            const pR = (r !== null) ? r : -1;

            if (i !== null && r !== null) {
              const duracaoPausa = (r < i) ? (r + 1440 - i) : (r - i);
              const tempoAteIntervalo = (i < e) ? (i + 1440 - e) : (i - e);

              if (tempoAteIntervalo < 120) {
                avisosAmarelos.push(`F${f.id} ${d.toUpperCase()}: Intervalo feito muito cedo (${fmt(tempoAteIntervalo)} de trabalho).`);
              }

              if (jornadaBruta > 360) {
                if (duracaoPausa < 60 || duracaoPausa > 120) {
                  alertasCli.push(`F${f.id} ${d.toUpperCase()}: Intervalo irregular (${duracaoPausa}min) para jornada > 6h.`);
                }
                if (tempoAteIntervalo > 360) {
                  alertasCli.push(`F${f.id} ${d.toUpperCase()}: Intervalo feito após ${fmt(tempoAteIntervalo)} de trabalho (deve ser antes de 6h).`);
                }
              } else {
                if (duracaoPausa > 15) {
                  alertasCli.push(`F${f.id} ${d.toUpperCase()}: Intervalo de ${duracaoPausa}min excede o limite de 15min para jornada < 6h.`);
                }
              }
              totalHours[pIdx] += (jornadaBruta - duracaoPausa);
            } else {
              totalHours[pIdx] += jornadaBruta;
            }

            for (let m = openTime; m < rangeFechamento; m++) {
              const mNormal = m % 1440;
              const dentroJornada = (s < e) ? (mNormal >= e || mNormal < s) : (mNormal >= e && mNormal < s);
              let dentroIntervalo = false;
              if (pI !== -1 && pR !== -1) {
                dentroIntervalo = (pR < pI) ? (mNormal >= pI || mNormal < pR) : (mNormal >= pI && mNormal < pR);
              }
              if (dentroJornada && !dentroIntervalo) minutosCobertos[m - openTime]++;
            }
          }
        }

        let inicioLacuna = -1;
        for (let m = 0; m < minutosCobertos.length; m++) {
          if (minutosCobertos[m] === 0 && inicioLacuna === -1) inicioLacuna = m + openTime;
          if (minutosCobertos[m] > 0 && inicioLacuna !== -1) {
            lacunasGerais.push(`${d.toUpperCase()}: Lacuna das ${fmt(inicioLacuna % 1440)} às ${fmt((m + openTime) % 1440)}`);
            inicioLacuna = -1;
          }
        }
        if (inicioLacuna !== -1) lacunasGerais.push(`${d.toUpperCase()}: Lacuna das ${fmt(inicioLacuna % 1440)} às ${fmt(rangeFechamento % 1440)}`);
      }
    });

    let canGenerate = transferErrors.length === 0 && lacunasGerais.length === 0 && alertasCli.length === 0;
    
    let relatorio = "RESUMO DA SEMANA:\n" + totalHours.map((h, i) => `Farma ${i + 1}: ${Math.floor(h / 60)}h${h % 60}min`).join("\n");
    
    if (!canGenerate) {
      relatorio += "\n\n⚠️ BLOQUEADO: Resolva os problemas abaixo para gerar o PDF.\n";
      if (transferErrors.length > 0) relatorio += "\nERROS DE MOVIMENTAÇÃO:\n" + transferErrors.join("\n");
      if (lacunasGerais.length > 0) relatorio += "\nLACUNAS:\n" + lacunasGerais.join("\n");
      if (alertasCli.length > 0) relatorio += "\n\nALERTAS CLT (IMPEDEM PDF):\n" + alertasCli.join("\n");
    } else {
      relatorio += "\n\n✅ COBERTURA COMPLETA E CLT OK: PDF Liberado.";
    }

    if (avisosAmarelos.length > 0) {
      relatorio += "\n\n⚠️ AVISO:\n" + avisosAmarelos.join("\n");
    }

    if (canGenerate && actions.inclusaoFarma) {
      const hasNewHiring = pharmacists.slice(0, qtd).some(f => f.tipoInclusao === 'Nova contratação');
      if (hasNewHiring) {
        // Não abre popup aqui — será mostrado dentro do popup de conclusão de download
      }
    }

    setValidationResult({
      text: relatorio,
      type: canGenerate ? (avisosAmarelos.length > 0 ? 'warning' : 'success') : 'error',
      canGeneratePdf: canGenerate,
      totalHours,
    });

    // Automatically trigger PDF generation if successful
    if (canGenerate) {
      gerarPDF();
    }
  };

  const limparTudo = () => {
    setQtd(1);
    setFilial('');
    setActions({ alterarHorario: false, baixaFarma: false, inclusaoFarma: false });
    setBaixaDetails({ nome: '', motivo: 'Desligamento', filialDestino: '' });
    setAbertura(initialScheduleRow());
    setFechamento(initialScheduleRow());
    setPharmacists(prev => prev.map(f => ({
      ...f,
      nome: '',
      cpf: '',
      tipoInclusao: 'Antigo',
      filialOrigem: '',
      entrada: initialScheduleRow(),
      intervalo: initialScheduleRow(),
      retorno: initialScheduleRow(),
      saida: initialScheduleRow(),
    })));
    setValidationResult({ text: '', type: 'idle', canGeneratePdf: false, totalHours: [] });
  };

  const downloadBlob = (bytes: Uint8Array, name: string) => {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // ─── Assinatura via Canvas ────────────────────────────────────────────────
  const gerarAssinaturaCanvas = (nome: string): Promise<Uint8Array> => {
    return new Promise((resolve) => {
      const W = 700, H = 100;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      ctx.clearRect(0, 0, W, H);

      // Fonte cursiva script — reta, sem rotação
      const fontSize = 40;
      ctx.font = `italic ${fontSize}px "Segoe Script", "Brush Script MT", "Dancing Script", cursive`;
      ctx.fillStyle = 'rgba(50,50,55,0.90)';
      ctx.textBaseline = 'middle';

      // Sombra sutil
      ctx.shadowColor = 'rgba(0,0,0,0.07)';
      ctx.shadowBlur = 1.5;
      ctx.shadowOffsetX = 0.3;
      ctx.shadowOffsetY = 0.3;

      // Sem transform — assinatura reta
      ctx.fillText(nome, 12, H / 2);

      // Blur leve
      const canvas2 = document.createElement('canvas');
      canvas2.width = W;
      canvas2.height = H;
      const ctx2 = canvas2.getContext('2d')!;
      ctx2.filter = 'blur(0.5px)';
      ctx2.drawImage(canvas, 0, 0);

      // Crop automático
      const imgData = ctx2.getImageData(0, 0, W, H);
      let minX = W, maxX = 0, minY = H, maxY = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (imgData.data[(y * W + x) * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const pad = 4;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(W, maxX + pad); maxY = Math.min(H, maxY + pad);
      const cropW = maxX - minX || W;
      const cropH = maxY - minY || H;

      const canvas3 = document.createElement('canvas');
      canvas3.width = cropW; canvas3.height = cropH;
      canvas3.getContext('2d')!.drawImage(canvas2, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      canvas3.toBlob(blob => {
        blob!.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
      }, 'image/png');
    });
  };

  // Gera assinatura cursiva para um nome específico
  const gerarAssinaturaNome = (nome: string): Promise<Uint8Array> => gerarAssinaturaCanvas(nome);

  // Aplica DUAS assinaturas no PDF de transferência:
  // - Linha DIMED: sempre "Luiz Gustavo de Menezes Braga" (representante fixo)
  // - Linha FARMACÊUTICO(A): nome do farmacêutico transferido
  const aplicarAssinaturaAoPdf = async (pdfBytes: Uint8Array, nomeFarma: string): Promise<Uint8Array> => {
    const NOME_REPRESENTANTE = 'Luiz Gustavo de Menezes Braga';

    const [pngBytesRep, pngBytesFarma] = await Promise.all([
      gerarAssinaturaCanvas(NOME_REPRESENTANTE),
      gerarAssinaturaCanvas(nomeFarma),
    ]);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const [imgRep, imgFarma] = await Promise.all([
      pdfDoc.embedPng(pngBytesRep),
      pdfDoc.embedPng(pngBytesFarma),
    ]);

    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    // Altura alvo da assinatura
    const sigH = 24;

    const desenhar = (img: typeof imgRep, x: number, y: number) => {
      const sigW = sigH * (img.width / img.height);
      page.drawImage(img, {
        x,
        y,
        width: sigW,
        height: sigH,
        opacity: 0.88,
      });
    };

    // Coordenadas exatas obtidas via PDF Coordinate Viewer
    // DIMED S.A. — posição da letra inicial: x=179, y=483
    desenhar(imgRep, 179, 483);

    // FARMACÊUTICO(A) — posição da letra inicial: x=182, y=391
    desenhar(imgFarma, 182, 391);

    try { pdfDoc.getForm().flatten(); } catch (_) {}
    return pdfDoc.save();
  };

  const gerarPDF = async () => {
    try {
      // Helper: preenche campo de texto com fonte auto-ajustada ao tamanho do campo
      const setFieldAutoSize = (
        form: ReturnType<InstanceType<typeof PDFDocument>['getForm']>,
        fieldName: string,
        value: string,
        maxFontSize = 10,
        minFontSize = 4
      ) => {
        try {
          const field = form.getTextField(fieldName);
          field.setText(value || '');
          for (let size = maxFontSize; size >= minFontSize; size--) {
            try { field.setFontSize(size); break; } catch (_) {}
          }
        } catch (_) {}
      };

      // 1. Gerar Tabela de Horários Principal
      const responseMain = await fetch(TEMPLATE_PDF_URL);
      if (!responseMain.ok) throw new Error(`Não foi possível carregar 'template.pdf' (status ${responseMain.status}). Verifique se o arquivo está na pasta public/.`);
      const contentTypeMain = responseMain.headers.get('content-type') || '';
      if (!contentTypeMain.includes('pdf') && !contentTypeMain.includes('octet-stream')) {
        throw new Error(`O arquivo 'template.pdf' não foi encontrado na pasta public/ (recebido: ${contentTypeMain}).`);
      }
      const bytesMain: ArrayBuffer = await responseMain.arrayBuffer();
      
      const pdfDocMain = await PDFDocument.load(bytesMain);
      const formMain = pdfDocMain.getForm();

      // Limpar todos os campos de texto antes de preencher para evitar valores duplicados/sobrepostos
      formMain.getFields().forEach(field => {
        try {
          if (field.constructor.name === 'PDFTextField') {
            (field as any).setText('');
          }
        } catch (_) {}
      });

      const setFMain = (f: string, v: string) => {
        setFieldAutoSize(formMain, f, v);
      };

      // Preencher horários da filial
      DAYS.forEach(d => {
        const dayUpper = d.toUpperCase();
        setFMain(`${dayUpper}_A`, abertura[d]);
        setFMain(`${dayUpper}_S`, fechamento[d]);
      });

      // Preencher dados dos farmacêuticos (F1 a F6)
      pharmacists.slice(0, qtd).forEach((f) => {
        const n = f.id;
        setFMain(`F${n}_NOME`, f.nome);
        setFMain(`F${n}_CPF`, f.cpf);
        setFMain(`F${n}_NASC`, f.dataNascimento);

        DAYS.forEach(d => {
          const dayUpper = d.toUpperCase();
          const dayPrefix = `F${n}_${dayUpper}`;
          setFMain(`${dayPrefix}_E`, f.entrada[d]);
          setFMain(`${dayPrefix}_I`, f.intervalo[d]);
          setFMain(`${dayPrefix}_R`, f.retorno[d]);
          setFMain(`${dayPrefix}_S`, f.saida[d]);
        });
      });

      const mainPdfBytes = await pdfDocMain.save();
      downloadBlob(mainPdfBytes, `Escala_${filial || 'Filial'}.pdf`);

      // 2. Gerar Declarações de Transferência Individuais (uma por farmacêutico Transferido)
      const currentBranchData = getBranchInfo(filial);
      const pendingPdfs: { nome: string; bytes: Uint8Array }[] = [];

      // Buscar os bytes do template de declaração apenas uma vez
      let bytesDec: ArrayBuffer | null = null;
      const responseDec = await fetch(DECLARACAO_PDF_URL);
      const contentTypeDec = responseDec.headers.get('content-type') || '';
      if (responseDec.ok && (contentTypeDec.includes('pdf') || contentTypeDec.includes('octet-stream'))) {
        bytesDec = await responseDec.arrayBuffer();
      }

      for (const f of pharmacists.slice(0, qtd)) {
        if (f.tipoInclusao === 'Transferido') {
          try {
            if (!bytesDec) {
              console.warn("Modelo de declaração não encontrado para o funcionário transferido.");
              continue;
            }

            // Carrega uma cópia limpa do template para cada farmacêutico
            const pdfDocDec = await PDFDocument.load(bytesDec);
            const formDec = pdfDocDec.getForm();

            // Limpar todos os campos antes de preencher para evitar sobreposição
            formDec.getFields().forEach(field => {
              try {
                if (field.constructor.name === 'PDFTextField') {
                  (field as any).setText('');
                }
              } catch (_) {}
            });

            const setFDec = (name: string, val: string, maxSize = 11) => {
              setFieldAutoSize(formDec, name, val, maxSize);
            };

            // Data de hoje
            const hoje = new Date();
            const diaAtual = String(hoje.getDate()).padStart(2, '0');
            const mesAtual = hoje.toLocaleString('pt-BR', { month: 'long' });
            const mesCapitalizado = mesAtual.charAt(0).toUpperCase() + mesAtual.slice(1);

            // F1_T: preenche com o nome do farmacêutico (texto no campo)
            // A assinatura cursiva é aplicada depois por aplicarAssinaturaAoPdf
            formDec.getFields().forEach(pdfField => {
              if (pdfField.getName() === 'F1_T') {
                try {
                  (pdfField as any).setText(f.nome || '');
                  for (let size = 10; size >= 4; size--) {
                    try { (pdfField as any).setFontSize(size); break; } catch (_) {}
                  }
                } catch (_) {}
              }
            });

            // CRF — fonte 7 para não sobrepor o texto à esquerda
            setFDec('CRF_T', f.crf, 7);

            // Município da filial de origem
            const originBranchData = getBranchInfo(f.filialOrigem);
            const origemCidade = originBranchData ? originBranchData.cidade : f.filialOrigem;
            // Tenta múltiplos nomes possíveis para o campo Município
            ['Municipio', 'MUNICIPIO', 'Município', 'municipio', 'Municipio_T'].forEach(n => {
              try { setFDec(n, origemCidade, 10); } catch (_) {}
            });

            // Dia — tenta campos existentes; se nenhum funcionar, usa o que for encontrado por lista
            const diaFields = formDec.getFields().map(f => f.getName());
            const diaFieldName = diaFields.find(n =>
              /^(dia|DIA|Dia|dia_t|Dia_T|D_T|DD)$/i.test(n)
            );
            if (diaFieldName) {
              setFDec(diaFieldName, diaAtual, 10);
            } else {
              // Cria preenchimento via texto direto se o campo não existir com nome esperado
              // Tenta mesmo assim com os nomes mais prováveis
              ['Dia', 'DIA', 'dia'].forEach(n => {
                try { setFDec(n, diaAtual, 10); } catch (_) {}
              });
            }

            // Mês — tenta múltiplos nomes possíveis
            const mesFields = formDec.getFields().map(fld => fld.getName());
            const mesFieldName = mesFields.find(n =>
              /^(mes|MES|Mes|mês|MÊS|Mês|mes_t|Mes_T|M_T)$/i.test(n)
            );
            if (mesFieldName) {
              setFDec(mesFieldName, mesCapitalizado, 10);
            } else {
              ['Mes', 'MES', 'mes', 'Mês'].forEach(n => {
                try { setFDec(n, mesCapitalizado, 10); } catch (_) {}
              });
            }

            // Endereço de origem
            if (originBranchData) {
              setFDec('END_ORIGEM', `${originBranchData.endereco}, ${originBranchData.cidade}`, 8);
            } else {
              setFDec('END_ORIGEM', f.filialOrigem, 8);
            }

            // Endereço final — endereço + cidade da filial destino
            if (currentBranchData) {
              setFDec('END_FINAL', `${currentBranchData.endereco}, ${currentBranchData.cidade}`, 8);
            } else {
              setFDec('END_FINAL', filial, 8);
            }

            const decPdfBytes = await pdfDocDec.save();
            const primeiroNome = f.nome.split(' ')[0] || `F${f.id}`;
            // Guarda em memória — o popup de assinatura decide como baixar
            pendingPdfs.push({ nome: `Declaracao_Transferencia_${primeiroNome}.pdf`, bytes: decPdfBytes });
          } catch (decErr) {
            console.error('Erro ao gerar declaração para: ' + f.nome, decErr);
          }
        }
      }

      // Salvar no Supabase (campos sem horários, CPF e nascimento)
      const hoje = new Date();
      const mesRef = hoje.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
      const mesRefFmt = mesRef.charAt(0).toUpperCase() + mesRef.slice(1); // "Abril/2026"

      const supabasePayload: Record<string, unknown> = {
        filial,
        mes_referencia: mesRefFmt,
        acao_alterar_horario: actions.alterarHorario,
        acao_baixa_farma: actions.baixaFarma,
        acao_inclusao_farma: actions.inclusaoFarma,
        baixa_nome: baixaDetails.nome || null,
        baixa_motivo: actions.baixaFarma ? baixaDetails.motivo : null,
        baixa_filial_destino: baixaDetails.filialDestino || null,
        qtd_farma: qtd,
      };

      pharmacists.slice(0, qtd).forEach((f, i) => {
        const n = i + 1;
        supabasePayload[`f${n}_nome`] = f.nome || null;
        supabasePayload[`f${n}_tipo_inclusao`] = f.tipoInclusao || null;
        supabasePayload[`f${n}_filial_origem`] = f.filialOrigem || null;
        supabasePayload[`f${n}_crf`] = f.crf || null;
      });

      try {
        await supabaseInsert(supabasePayload);
        
        // ========================================
        // GESTÃO DE FARMACÊUTICOS POR FILIAL
        // ========================================
        
        // 1. Processar baixas primeiro (se houver)
        if (actions.baixaFarma && baixaDetails.nome) {
          await processarBaixas(filial, baixaDetails);
        }
        
        // 2. Processar transferências (remover da origem)
        await processarTransferencias(
          pharmacists.slice(0, qtd),
          filial
        );
        
        // 3. Atualizar estado atual da filial
        const farmaceuticosParaSalvar = pharmacists.slice(0, qtd)
          .filter(f => f.nome) // Apenas farmacêuticos com nome
          .map(f => ({
            nome: f.nome,
            crf: f.crf,
            tipoInclusao: f.tipoInclusao,
            filialOrigem: f.filialOrigem
          }));
        
        await atualizarEstadoAtualFilial(filial, farmaceuticosParaSalvar);
        
        console.log('✅ Banco de dados de farmacêuticos atualizado com sucesso!');
        
      } catch (sbErr) {
        // Não bloqueia o download se o Supabase falhar
        console.error('Falha ao salvar no Supabase:', sbErr);
      }

      // Mostrar popup unificado de conclusão
      const filesGenerated: string[] = [`Escala_${filial || 'Filial'}.pdf`];
      const hasTransferred = pharmacists.slice(0, qtd).some(f => f.tipoInclusao === 'Transferido');
      if (hasTransferred) {
        pendingPdfs.forEach(p => filesGenerated.push(p.nome));
        setPendingDecPdfs(pendingPdfs);
        // Mostra popup de assinatura primeiro
        setShowSignPopup(true);
      } else {
        // Sem transferidos: popup de conclusão normal
        const hasNewHiring = pharmacists.slice(0, qtd).some(f => f.tipoInclusao === 'Nova contratação');
        setDownloadedFiles(filesGenerated);
        setDownloadHasNewHiring(hasNewHiring);
        setShowDownloadPopup(true);
      }
    } catch (err) {
      alert("Erro ao processar PDFs: " + (err as Error).message);
    }
  };

  // --- Render Helpers ---
  const renderScheduleInputs = (label: string, row: ScheduleRow, setter: (val: ScheduleRow) => void) => (
    <tr key={label}>
      <td className="ph-title text-left pl-2.5 font-semibold">{label}</td>
      {DAYS.map(d => (
        <td key={d}>
          <input 
            type="time" 
            value={row[d]} 
            onChange={e => setter({ ...row, [d]: e.target.value })}
            className="w-[92%]"
          />
        </td>
      ))}
      <td className="w-[45px]">
        <button 
          onClick={() => handleCopyRow(row, setter)}
          className="p-1 px-2 cursor-pointer bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
          title="Copiar primeira coluna para todas"
        >
          <ClipboardCopy size={16} />
        </button>
      </td>
    </tr>
  );

  // ─── Mobile tab labels ───
  const MOBILE_TABS = [
    { key: 'config', label: 'Config' },
    { key: 'filial', label: 'Filial' },
    { key: 'farma',  label: 'Farmacêuticos' },
    { key: 'validar',label: 'Validar' },
  ] as const;

  // ─────────────────────────────────────────────
  //  MOBILE LAYOUT
  // ─────────────────────────────────────────────
  if (isMobile) return (
    <div className="min-h-screen font-sans text-slate-100 antialiased flex flex-col relative" style={{ colorScheme: 'dark' }}>
      {/* Background com imagem e gradiente overlay */}
      <div className="fixed inset-0 -z-10">
        <div 
          className="absolute inset-0"
          style={{ 
            backgroundImage: 'url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        />
        <div 
          className="absolute inset-0" 
          style={{ 
            background: 'linear-gradient(135deg, rgba(15,12,41,0.95), rgba(48,43,99,0.92), rgba(36,36,62,0.95))'
          }}
        />
      </div>

      {/* Mobile Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Clock className="w-4 h-4 text-white"/>
          </div>
          <span className="text-xs font-black text-white uppercase tracking-wider">Validador</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-indigo-300 font-bold uppercase">Filial {filial || '—'}</span>
          <button onClick={() => setIsMobile(false)}
            className="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-xl px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:bg-white/20 transition-all">
            <Monitor size={13}/> Desktop
          </button>
        </div>
      </header>

      {/* Mobile Tabs */}
      <div className="flex shrink-0 border-b border-white/10 bg-black/20">
        {MOBILE_TABS.map(tab => (
          <button key={tab.key} onClick={() => setMobileTab(tab.key)}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider transition-all ${mobileTab === tab.key ? 'text-indigo-300 border-b-2 border-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mobile Tab Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* ── TAB: Config ── */}
        {mobileTab === 'config' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[9px] uppercase font-black text-indigo-300 tracking-widest">Filial</label>
              <input type="text" placeholder="Identificação da Filial" value={filial} onChange={e => setFilial(e.target.value)}
                className="w-full bg-indigo-500/10 border-2 border-indigo-400/40 text-white text-xl font-black rounded-2xl py-3 px-4 focus:outline-none focus:border-indigo-400 text-center"/>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mb-3">Ações</p>
              <ActionCheckboxes actions={actions} setActions={setActions}/>
            </div>
            <div className={`bg-white/5 border border-white/10 rounded-2xl p-4 transition-all ${!isStep2Done ? 'opacity-40 pointer-events-none' : ''}`}>
              <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mb-3">Qtd. Farmacêuticos</p>
              <select value={qtd} onChange={e => setQtd(Number(e.target.value))}
                className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-lg font-bold outline-none text-white">
                <option value={0} className="bg-[#1e1b4b] text-slate-400">Selecione...</option>
                {[1,2,3,4,5,6].map(n => <option key={n} value={n} className="bg-[#1e1b4b]">{n} farmacêutico{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            {actions.baixaFarma && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-3">Formulário de Baixa</p>
                <BaixaForm baixaDetails={baixaDetails} setBaixaDetails={setBaixaDetails}/>
              </div>
            )}
            <button onClick={() => setMobileTab('filial')}
              className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest text-white flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
              style={{ background: isStep1Done && isStep2Done ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'rgba(255,255,255,0.05)', opacity: isStep1Done && isStep2Done ? 1 : 0.4 }}>
              Próximo: Horário Filial <ChevronRight size={16}/>
            </button>
          </motion.div>
        )}

        {/* ── TAB: Filial ── */}
        {mobileTab === 'filial' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Horários de Abertura e Fechamento</p>
            {DAYS.map(d => (
              <div key={d} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-4 py-2 bg-indigo-500/10 border-b border-white/5">
                  <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">{d.toUpperCase()}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 p-3">
                  <div>
                    <label className="text-[9px] uppercase font-bold text-slate-500">Abertura</label>
                    <input type="time" value={abertura[d]} onChange={e => setAbertura({ ...abertura, [d]: e.target.value })}
                      className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-400 text-center"/>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-bold text-slate-500">Fechamento</label>
                    <input type="time" value={fechamento[d]} onChange={e => setFechamento({ ...fechamento, [d]: e.target.value })}
                      className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-400 text-center"/>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => setMobileTab('farma')}
              className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest text-white flex items-center justify-center gap-2 active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
              Próximo: Farmacêuticos <ChevronRight size={16}/>
            </button>
          </motion.div>
        )}

        {/* ── TAB: Farmacêuticos ── */}
        {mobileTab === 'farma' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Farma selector */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pharmacists.slice(0, qtd).map((f, idx) => (
                <button key={f.id} onClick={() => setMobileFarmaIdx(idx)}
                  className={`shrink-0 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${mobileFarmaIdx === idx ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                  F{f.id}{f.nome ? ` · ${f.nome.split(' ')[0]}` : ''}
                </button>
              ))}
            </div>

            {/* Current farma */}
            {pharmacists.slice(0, qtd).map((f, fIdx) => fIdx !== mobileFarmaIdx ? null : (
              <div key={f.id} className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mb-3">Dados — F{f.id}</p>
                  <MobileFarmaInfo  f={f}
                    fIdx={fIdx}
                    actions={actions}
                    isFarmaNomeOk={isFarmaNomeOk}
                    isFarmaCpfNascOk={isFarmaCpfNascOk}
                    updatePharmacist={updatePharmacist}/>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mb-3">Horários — F{f.id}</p>
                  <MobileScheduleDay f={f}
                    fIdx={fIdx}
                    isFarmaScheduleOk={isFarmaScheduleOk}
                    updateFarmaSchedule={updateFarmaSchedule}/>
                </div>
                <div className="flex gap-3">
                  {mobileFarmaIdx > 0 && (
                    <button onClick={() => setMobileFarmaIdx(i => i - 1)}
                      className="flex-1 py-3 rounded-2xl font-bold text-sm text-slate-300 bg-white/5 border border-white/10 flex items-center justify-center gap-2 active:scale-[0.97]">
                      <ChevronLeft size={16}/> F{f.id - 1}
                    </button>
                  )}
                  {mobileFarmaIdx < qtd - 1 ? (
                    <button onClick={() => setMobileFarmaIdx(i => i + 1)}
                      className="flex-1 py-3 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 active:scale-[0.97]"
                      style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                      F{f.id + 1} <ChevronRight size={16}/>
                    </button>
                  ) : (
                    <button onClick={() => setMobileTab('validar')}
                      className="flex-1 py-3 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 active:scale-[0.97]"
                      style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}>
                      Validar <ChevronRight size={16}/>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* ── TAB: Validar ── */}
        {mobileTab === 'validar' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className={`rounded-2xl p-4 border font-mono text-xs leading-relaxed transition-all ${
              validationResult.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
              validationResult.type === 'error'   ? 'bg-red-500/10 border-red-500/20 text-red-300' :
              validationResult.type === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300' :
              'bg-black/40 border-white/5 text-slate-400'}`}>
              <p className="font-bold text-white mb-2 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-white"></div> RESUMO:</p>
              <p className="whitespace-pre-wrap">{validationResult.text || '> Aguardando dados...'}</p>
            </div>
            <button onClick={validarSemana} disabled={!isFilialHoraOk}
              className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest text-white flex items-center justify-center gap-2 active:scale-[0.97] transition-all ${isFilialHoraOk ? '' : 'opacity-40 cursor-not-allowed'}`}
              style={{ background: isFilialHoraOk ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'rgba(79,70,229,0.2)' }}>
              <CheckCircle size={16}/> {isFilialHoraOk ? 'Validar Escala' : 'Preencha horário da filial'}
            </button>
            <button onClick={gerarPDF} disabled={!validationResult.canGeneratePdf}
              className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.97] transition-all border ${validationResult.canGeneratePdf ? 'text-white border-white/20 bg-white/10' : 'text-slate-600 border-white/5 bg-black/20 cursor-not-allowed opacity-50'}`}>
              <FileDown size={16} className={validationResult.canGeneratePdf ? 'text-indigo-400' : ''}/> Gerar PDF
            </button>
          </motion.div>
        )}
      </div>

      {/* Bottom safe area spacer */}
      <div className="h-6 shrink-0"/>
    </div>
  );

  // ─────────────────────────────────────────────
  //  DESKTOP LAYOUT (unchanged)
  // ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 font-sans text-slate-100 antialiased overflow-hidden relative" style={{ colorScheme: 'dark' }}>
      {/* Background com imagem e gradiente overlay */}
      <div className="fixed inset-0 -z-10">
        <div 
          className="absolute inset-0"
          style={{ 
            backgroundImage: 'url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        />
        <div 
          className="absolute inset-0" 
          style={{ 
            background: 'linear-gradient(135deg, rgba(15,12,41,0.95), rgba(48,43,99,0.92), rgba(36,36,62,0.95))'
          }}
        />
      </div>
      
      <div 
        className="relative w-full h-full max-w-[1240px] max-h-[920px] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in duration-700"
        style={{
          background: 'rgba(15, 12, 41, 0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
        }}
      >
        
        {/* Header - Centered Filial */}
        <header className="flex flex-col items-center justify-center p-2 border-b border-white/10 shrink-0 bg-white/5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-500 rounded flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-sm font-light tracking-widest text-white uppercase opacity-80">Validador Semanal de Horários</h1>
            {/* Toggle Mobile */}
            <button onClick={() => setIsMobile(true)}
              className="ml-4 flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-xl px-3 py-1.5 text-[11px] font-bold text-slate-400 hover:text-white hover:bg-white/15 transition-all">
              <Smartphone size={12}/> Mobile
            </button>
          </div>
          
          <div className="flex items-center gap-4 bg-indigo-500/10 p-2 px-8 rounded-2xl border border-indigo-400/30 shadow-indigo-500/10 shadow-xl">
            <span className="text-xs font-black uppercase text-indigo-300 tracking-tighter">Filial:</span>
            <input 
              type="text" 
              placeholder="Identificação da Filial"
              value={filial} 
              onChange={e => setFilial(e.target.value)}
              className="bg-transparent border-b-2 border-indigo-400 text-lg py-0.5 px-3 focus:outline-none focus:border-white w-72 text-center text-white font-black"
            />
          </div>
        </header>

        {/* Global Controls & Actions - Reordered Step 2 & 3 */}
        <section className={`p-4 grid grid-cols-12 gap-6 shrink-0 border-b border-white/10 transition-all ${!isStep1Done ? 'locked-section' : 'unlocked-section'}`}>
          
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-3">
            <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest flex items-center gap-2">
               Ações Desejadas
            </p>
            <div className="grid grid-cols-1 gap-2">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className={`w-5 h-5 rounded-lg border-2 border-white/20 flex items-center justify-center transition-all ${actions.alterarHorario ? 'bg-indigo-500 border-indigo-400 shadow-lg shadow-indigo-500/50' : 'bg-white/5 group-hover:border-white/40'}`}>
                  {actions.alterarHorario && <CheckCircle size={14} className="text-white" />}
                  <input 
                    type="checkbox" 
                    checked={actions.alterarHorario} 
                    onChange={e => setActions(prev => ({ ...prev, alterarHorario: e.target.checked }))}
                    className="hidden" 
                  />
                </div>
                <span className={`text-[11px] font-bold uppercase transition-colors ${actions.alterarHorario ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>Alterar horário</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className={`w-5 h-5 rounded-lg border-2 border-white/20 flex items-center justify-center transition-all ${actions.baixaFarma ? 'bg-red-500 border-red-400 shadow-lg shadow-red-500/50' : 'bg-white/5 group-hover:border-white/40'}`}>
                  {actions.baixaFarma && <CheckCircle size={14} className="text-white" />}
                  <input 
                    type="checkbox" 
                    checked={actions.baixaFarma} 
                    onChange={e => setActions(prev => ({ ...prev, baixaFarma: e.target.checked }))}
                    className="hidden" 
                  />
                </div>
                <span className={`text-[11px] font-bold uppercase transition-colors ${actions.baixaFarma ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>Baixa de farmacêutico</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className={`w-5 h-5 rounded-lg border-2 border-white/20 flex items-center justify-center transition-all ${actions.inclusaoFarma ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/50' : 'bg-white/5 group-hover:border-white/40'}`}>
                  {actions.inclusaoFarma && <CheckCircle size={14} className="text-white" />}
                  <input 
                    type="checkbox" 
                    checked={actions.inclusaoFarma} 
                    onChange={e => setActions(prev => ({ ...prev, inclusaoFarma: e.target.checked }))}
                    className="hidden" 
                  />
                </div>
                <span className={`text-[11px] font-bold uppercase transition-colors ${actions.inclusaoFarma ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>Inclusão de farmacêutico</span>
              </label>
            </div>
          </div>

          <div className={`col-span-12 lg:col-span-3 flex flex-col gap-3 border-l border-white/10 pl-6 transition-all ${!isStep2Done ? 'opacity-40 pointer-events-none grayscale' : 'opacity-100'}`}>
            <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">
               Quantidade de farmacêuticos na filial
            </p>
            <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-2 hover:bg-white/10 transition-colors">
              <select 
                value={qtd} 
                onChange={e => setQtd(Number(e.target.value))}
                className="bg-transparent text-lg font-bold outline-none border-none p-0 cursor-pointer text-white w-full"
              >
                <option value={0} className="bg-[#1e1b4b] text-slate-400">Selecione...</option>
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n} className="bg-[#1e1b4b]">{n}</option>)}
              </select>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-6 flex flex-col gap-3 border-l border-white/10 pl-6">
            <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest flex items-center gap-2">
               Formulário de Movimentação
            </p>
            
            <AnimatePresence mode="wait">
              {actions.baixaFarma ? (
                <motion.div 
                  key="baixa-form"
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  className="bg-red-500/5 p-3 rounded-xl border border-red-500/20 space-y-3"
                >
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-2">
                    <UserMinus size={14} /> Formulário de baixa
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] uppercase opacity-60 font-bold">Farma a ser baixado</label>
                      <input 
                        type="text" 
                        value={baixaDetails.nome} 
                        onChange={e => setBaixaDetails(p => ({ ...p, nome: e.target.value }))}
                        className="bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-xs focus:bg-white/10 outline-none focus:border-red-500/50"
                        placeholder="Nome Completo"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] uppercase opacity-60 font-bold">Motivo</label>
                      <select 
                        value={baixaDetails.motivo}
                        onChange={e => setBaixaDetails(p => ({ ...p, motivo: e.target.value as any }))}
                        className="bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-xs outline-none text-slate-200"
                      >
                        <option value="Desligamento" className="bg-[#0f172a]">Desligamento</option>
                        <option value="Transferência" className="bg-[#0f172a]">Transferência</option>
                      </select>
                    </div>
                  </div>
                  {baixaDetails.motivo === 'Transferência' && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="flex flex-col gap-1.5 pt-2"
                    >
                      <label className="text-[8px] uppercase opacity-60 font-bold">Filial Destino</label>
                      <input 
                        type="text" 
                        value={baixaDetails.filialDestino} 
                        onChange={e => setBaixaDetails(p => ({ ...p, filialDestino: e.target.value }))}
                        className="bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-red-500"
                        placeholder="Número ou Nome da Filial"
                      />
                    </motion.div>
                  )}
                </motion.div>
              ) : (
                <div className="h-[90px] flex items-center justify-center border border-dashed border-white/5 rounded-xl bg-black/10">
                  <p className="text-[10px] text-slate-500 italic">Informações de baixa serão solicitadas aqui</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Schedule Table Area */}
        <div className={`flex-1 p-4 overflow-hidden flex flex-col transition-all ${!isEverythingUnlocked ? 'locked-section blur-sm' : 'unlocked-section'}`}>
          <div className="flex-1 w-full border border-white/10 rounded-2xl overflow-hidden bg-black/30 flex flex-col shadow-2xl">
            <div className="overflow-auto flex-1 custom-scrollbar">
              <table className="w-full text-left text-[11px] border-collapse min-w-[1000px] table-fixed">
                <thead className="bg-white/10 text-indigo-200 sticky top-0 uppercase tracking-tighter z-10 backdrop-blur-md">
                  <tr>
                    <th colSpan={2} className="p-4 w-[280px] border-r border-white/5 font-black text-[10px] text-center">Informações / Período</th>
                    {DAYS.map(day => <th key={day} className="p-2 text-center border-r border-white/5 font-black text-[10px] w-[100px] min-w-[100px]">{day.toUpperCase()}</th>)}
                    <th className="p-4 text-center w-14 min-w-[56px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {/* Store Status Rows */}
                  <tr className={`bg-indigo-500/5 group border-b-2 border-indigo-500/20 transition-all duration-300 ${!isEverythingUnlocked ? 'opacity-40 pointer-events-none' : ''}`}>
                    <td colSpan={2} className="p-4 border-r border-white/5 w-[280px]">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-8 bg-indigo-500 rounded-full"></div>
                        <div>
                          <p className="font-black text-white text-xs uppercase tracking-tighter">Abertura Filial</p>
                          <p className="text-[9px] text-indigo-300/60 uppercase font-black">Horário da Loja</p>
                        </div>
                      </div>
                    </td>
                    {DAYS.map(d => (
                      <td key={d} className="p-3 w-[100px] min-w-[100px]">
                        <input 
                          type="time" 
                          value={abertura[d]} 
                          onChange={e => setAbertura({ ...abertura, [d]: e.target.value })}
                          className="bg-white/5 border border-white/10 rounded-lg w-full text-center py-2 focus:bg-indigo-500/10 outline-none text-white font-bold text-sm shadow-inner focus:border-indigo-500/50 transition-all"
                        />
                      </td>
                    ))}
                    <td className="p-3 text-center w-14 min-w-[56px]">
                      <button onClick={() => handleCopyRow(abertura, setAbertura)} className="p-2 bg-white/5 hover:bg-white/15 rounded-xl text-slate-400 transition-all active:scale-90"><ClipboardCopy size={16} /></button>
                    </td>
                  </tr>
                  <tr className={`bg-indigo-500/5 group border-b-2 border-indigo-500/20 transition-all duration-300 ${!isEverythingUnlocked ? 'opacity-40 pointer-events-none' : ''}`}>
                    <td colSpan={2} className="p-4 border-r border-white/5 w-[280px]">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-8 bg-indigo-500 rounded-full"></div>
                        <div>
                          <p className="font-black text-white text-xs uppercase tracking-tighter">Fechamento Filial</p>
                          <p className="text-[9px] text-indigo-300/60 uppercase font-black">Horário da Loja</p>
                        </div>
                      </div>
                    </td>
                    {DAYS.map(d => (
                      <td key={d} className="p-3 w-[100px] min-w-[100px]">
                        <input 
                          type="time" 
                          value={fechamento[d]} 
                          onChange={e => setFechamento({ ...fechamento, [d]: e.target.value })}
                          className="bg-white/5 border border-white/10 rounded-lg w-full text-center py-2 focus:bg-indigo-500/10 outline-none text-white font-bold text-sm shadow-inner focus:border-indigo-500/50 transition-all"
                        />
                      </td>
                    ))}
                    <td className="p-3 text-center w-14 min-w-[56px]">
                      <button onClick={() => handleCopyRow(fechamento, setFechamento)} className="p-2 bg-white/5 hover:bg-white/15 rounded-xl text-slate-400 transition-all active:scale-90"><ClipboardCopy size={16} /></button>
                    </td>
                  </tr>

                  {/* Pharmacists Rows - Restructured for direct alignment */}
                  {pharmacists.slice(0, qtd).map((f, fIdx) => {
                    const rowConfigs = [
                      { field: 'entrada' as const, label: 'Entrada' },
                      { field: 'intervalo' as const, label: 'Intervalo' },
                      { field: 'retorno' as const, label: 'Retorno do Intervalo' },
                      { field: 'saida' as const, label: 'Saída' }
                    ];

                    const isFocused = focusedFarmaId === f.id;
                    const isDimmed = focusedFarmaId !== null && !isFocused;

                    const nomeUnlocked = isFarmaNomeOk(fIdx);
                    const cpfNascUnlocked = isFarmaCpfNascOk(fIdx);
                    const crfUnlocked = isFarmaCrfOk(fIdx);
                    const schedUnlocked = isFarmaScheduleOk(fIdx);
                    // Bloco inteiro fica cinza até abertura+fechamento da filial preenchidos
                    const blocoFilialDimmed = !isFilialHoraOk;

                    return (
                      <React.Fragment key={f.id}>
                        {rowConfigs.map((config, idx) => (
                          <tr key={`${f.id}-${config.field}`} className={`group/row border-b border-white/5 last:border-b-2 transition-all duration-300 ${blocoFilialDimmed ? 'opacity-20 pointer-events-none grayscale' : isFocused ? 'bg-indigo-500/[0.08]' : isDimmed ? 'opacity-30 bg-transparent' : 'bg-indigo-500/[0.03]'}`}>
                            {idx === 0 && (
                              <td rowSpan={4} className="p-3 align-top border-r border-white/5 bg-indigo-500/[0.08] w-[180px]">
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center font-black text-indigo-400 border border-white/10 text-[10px]">F{f.id}</div>
                                    <div className={`flex-1 min-w-0 transition-all duration-300 ${!nomeUnlocked ? 'opacity-30 pointer-events-none' : ''}`}>
                                      <input 
                                        type="text" 
                                        placeholder="Nome"
                                        value={f.nome} 
                                        onChange={e => updatePharmacist(f.id, { nome: e.target.value })}
                                        disabled={!nomeUnlocked}
                                        className="bg-transparent border-b border-white/10 text-white outline-none focus:border-indigo-400 py-0.5 font-bold text-[11px] w-full truncate disabled:cursor-not-allowed"
                                      />
                                    </div>
                                  </div>
                                  
                                  <div className={`space-y-1.5 transition-all duration-300 ${!cpfNascUnlocked ? 'opacity-30 pointer-events-none' : ''}`}>
                                    <div className="flex flex-col">
                                      <label className="text-[8px] uppercase font-bold text-slate-500">CPF:</label>
                                      <input 
                                        type="text" 
                                        value={f.cpf} 
                                        onChange={e => updatePharmacist(f.id, { cpf: e.target.value })}
                                        disabled={!cpfNascUnlocked}
                                        className="bg-black/40 border border-white/5 rounded-md px-2 py-0.5 text-[10px] text-indigo-100 outline-none disabled:cursor-not-allowed"
                                      />
                                    </div>
                                    <div className="flex flex-col">
                                      <label className="text-[8px] uppercase font-bold text-slate-500">Data de Nascimento:</label>
                                      <input 
                                        type="text" 
                                        value={f.dataNascimento} 
                                        onChange={e => updatePharmacist(f.id, { dataNascimento: e.target.value })}
                                        disabled={!cpfNascUnlocked}
                                        className="bg-black/40 border border-white/5 rounded-md px-2 py-0.5 text-[10px] text-indigo-100 outline-none disabled:cursor-not-allowed"
                                      />
                                    </div>
                                    {/* CRF — libera após CPF + Nascimento */}
                                    <div className={`flex flex-col transition-all duration-300 ${!crfUnlocked ? 'opacity-30 pointer-events-none' : ''}`}>
                                      <label className="text-[8px] uppercase font-bold text-slate-500">CRF/RS:</label>
                                      <input 
                                        type="text" 
                                        placeholder="Ex: 690005"
                                        value={f.crf} 
                                        onChange={e => updatePharmacist(f.id, { crf: e.target.value })}
                                        disabled={!crfUnlocked}
                                        className="bg-black/40 border border-white/5 rounded-md px-2 py-0.5 text-[10px] text-indigo-100 outline-none disabled:cursor-not-allowed"
                                      />
                                    </div>
                                  </div>

                                  {actions.inclusaoFarma && (
                                    <div className={`pt-2 border-t border-white/5 space-y-1.5 transition-all duration-300 ${!cpfNascUnlocked ? 'opacity-30 pointer-events-none' : ''}`}>
                                      <select 
                                        value={f.tipoInclusao}
                                        onChange={e => updatePharmacist(f.id, { tipoInclusao: e.target.value as any })}
                                        disabled={!cpfNascUnlocked}
                                        className="bg-emerald-500/10 border border-white/10 rounded-md text-[9px] py-1 px-1.5 outline-none font-bold w-full disabled:cursor-not-allowed"
                                      >
                                        <option value="Já vinculado" className="bg-[#0f172a]">Já vinculado</option>
                                        <option value="Nova contratação" className="bg-[#0f172a]">Nova Contratação</option>
                                        <option value="Transferido" className="bg-[#0f172a]">Transferido</option>
                                      </select>
                                      {/* Quando Transferido: só filial de origem */}
                                      {f.tipoInclusao === 'Transferido' && (
                                        <input 
                                          type="text" 
                                          placeholder="Filial Origem"
                                          value={f.filialOrigem} 
                                          onChange={e => updatePharmacist(f.id, { filialOrigem: e.target.value })}
                                          className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[9px] outline-none w-full border-l-2 border-l-amber-500"
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}
                            {/* Label centralizado verticalmente */}
                            <td className={`p-3 w-[100px] text-[9px] uppercase font-black border-r border-white/5 bg-indigo-500/[0.02] leading-tight min-w-[100px] text-center align-middle transition-all duration-300 ${!schedUnlocked ? 'text-slate-700 opacity-40' : 'text-slate-500 group-hover/row:text-indigo-300'}`}>
                              {config.label}
                            </td>
                            {DAYS.map(d => (
                              <td key={d} className={`p-2 border-r border-white/5 w-[100px] min-w-[100px] transition-all duration-300 ${!schedUnlocked ? 'opacity-20 pointer-events-none grayscale' : ''}`}>
                                <input 
                                  type="time" 
                                  value={f[config.field][d] as string} 
                                  onChange={e => updateFarmaSchedule(f.id, config.field, d, e.target.value)}
                                  onFocus={() => setFocusedFarmaId(f.id)}
                                  onBlur={() => setFocusedFarmaId(null)}
                                  disabled={!schedUnlocked}
                                  className={`bg-white/5 border border-white/10 rounded-lg w-full text-center py-2 outline-none font-bold transition-all text-sm disabled:cursor-not-allowed ${isFocused ? 'text-white focus:bg-indigo-500/30 focus:border-indigo-400/60 shadow-[0_0_12px_rgba(99,102,241,0.3)]' : 'text-slate-100 focus:text-white focus:bg-indigo-500/20'}`}
                                />
                              </td>
                            ))}
                            <td className="p-2 text-center w-14 min-w-[56px]">
                              <button onClick={() => handleCopyFarmaRow(f.id, config.field, 'seg')} className="p-2 bg-white/5 hover:bg-indigo-500/20 rounded-xl text-slate-500 hover:text-white transition-all"><ClipboardCopy size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer / Legends */}
            <div className="shrink-0 p-3 flex items-center justify-between bg-black/40 border-t border-white/10">
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-tighter">Conformidade CLT</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-tighter">Escala Validada</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-[10px] text-red-400 uppercase font-bold tracking-tighter">Lacunas de Cobertura</span>
                </div>
              </div>
              <span className="text-[9px] text-slate-500 italic flex items-center gap-1">
                <AlertCircle size={10} /> Preencha todos os campos obrigatórios para liberar o PDF
              </span>
            </div>
          </div>
        </div>

        {/* Summary & Results Footer */}
        <section className="p-4 flex gap-4 border-t border-white/10 bg-white/5 shrink-0">
          <div className={`flex-1 rounded-xl p-4 border font-mono text-[11px] h-32 overflow-auto custom-scrollbar transition-all ${
            validationResult.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
            validationResult.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-300' :
            validationResult.type === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300' :
            'bg-black/40 border-white/5 text-slate-400'
          }`}>
            <div className="mb-2 font-bold flex items-center gap-2 text-white">
              <div className="w-1.5 h-1.5 rounded-full bg-white"></div> RESUMO DO PROCESSAMENTO:
            </div>
            <div className="whitespace-pre-wrap leading-relaxed">
              {validationResult.text || "> Aguardando dados de entrada..."}
            </div>
          </div>

          <div className="flex flex-col gap-3 w-72">
            <button 
              onClick={validarSemana}
              disabled={!isFilialHoraOk}
              title={!isFilialHoraOk ? 'Preencha ao menos 1 dia de abertura e fechamento da filial' : ''}
              className={`text-white text-xs font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg ${
                isFilialHoraOk
                  ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/40'
                  : 'bg-indigo-900/40 cursor-not-allowed opacity-50 shadow-none'
              }`}
            >
              <CheckCircle size={14} />
              {isFilialHoraOk ? 'Validar Escala' : 'Preencha horário da filial'}
            </button>
            <button 
              disabled={!validationResult.canGeneratePdf}
              onClick={gerarPDF}
              className={`text-xs font-bold py-3 rounded-lg border transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${
                validationResult.canGeneratePdf 
                  ? 'bg-white/10 hover:bg-white/20 text-white border-white/20 shadow-xl' 
                  : 'bg-black/20 text-slate-600 border-white/5 cursor-not-allowed opacity-50'
              }`}
            >
              <FileDown size={14} className={validationResult.canGeneratePdf ? "text-indigo-400" : ""} />
              Gerar PDF Preenchido
            </button>
          </div>
        </section>
      </div>

      {/* ── Popup de Assinatura (apenas para Transferidos) ── */}
      <AnimatePresence>
        {showSignPopup && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-xl">
            <motion.div
              initial={{ y: 60, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 60, opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl"
              style={{ background: 'rgba(18,18,28,0.95)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              {/* pill */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20"></div>
              </div>

              {/* Icon + title */}
              <div className="flex flex-col items-center pt-4 pb-3 px-6">
                <div className="w-16 h-16 rounded-[1.2rem] bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-900/50 mb-4">
                  <PenLine size={30} className="text-white" />
                </div>
                <p className="text-[11px] font-bold text-amber-300 uppercase tracking-widest mb-1">Assinatura Requerida</p>
                <h2 className="text-[21px] font-black text-white text-center leading-tight tracking-tight">
                  Deseja assinar pelo site?
                </h2>
                <p className="text-[11px] text-slate-400 text-center mt-2 leading-relaxed">
                  {pendingDecPdfs.length} declaraç{pendingDecPdfs.length > 1 ? 'ões' : 'ão'} de transferência aguardando assinatura
                </p>
              </div>

              {/* Arquivo(s) */}
              <div className="mx-5 mb-3 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                {pendingDecPdfs.map((p, i) => (
                  <div key={p.nome} className={`flex items-center gap-3 px-4 py-2.5 ${i < pendingDecPdfs.length - 1 ? 'border-b border-white/5' : ''}`}>
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                      <FileDown size={14} className="text-amber-400" />
                    </div>
                    <span className="text-[11px] text-slate-300 truncate">{p.nome}</span>
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <div className="px-5 pb-6 pt-1 flex flex-col gap-2">
                {/* Assinar pelo site — verde */}
                <button
                  onClick={async () => {
                    setShowSignPopup(false);
                    for (const p of pendingDecPdfs) {
                      const nomeFarma = pharmacists.find(f =>
                        f.tipoInclusao === 'Transferido' && p.nome.includes(f.nome.split(' ')[0])
                      )?.nome || p.nome;
                      try {
                        const signedBytes = await aplicarAssinaturaAoPdf(p.bytes, nomeFarma);
                        downloadBlob(signedBytes, p.nome.replace('.pdf', '_assinado.pdf'));
                      } catch (e) {
                        downloadBlob(p.bytes, p.nome);
                      }
                    }
                    // Sem popup adicional — download concluído diretamente
                  }}
                  className="w-full py-4 rounded-2xl font-black text-[13px] uppercase tracking-widest text-white transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', boxShadow: '0 4px 24px rgba(5,150,105,0.35)' }}
                >
                  <PenLine size={16} /> Assinatura pelo site
                </button>

                {/* Assinar por GOV — indigo, mesmo estilo do existente */}
                <button
                  onClick={() => {
                    setShowSignPopup(false);
                    // Baixa os PDFs sem assinatura para o usuário assinar no GOV
                    pendingDecPdfs.forEach(p => downloadBlob(p.bytes, p.nome));
                    const hasNewHiring = pharmacists.slice(0, qtd).some(f => f.tipoInclusao === 'Nova contratação');
                    setDownloadedFiles([`Escala_${filial || 'Filial'}.pdf`, ...pendingDecPdfs.map(p => p.nome)]);
                    setDownloadHasNewHiring(hasNewHiring);
                    setShowDownloadPopup(true);
                    window.open("https://www.gov.br/pt-br/servicos/assinatura-eletronica?origem=maisacessado_home", "_blank");
                  }}
                  className="w-full py-4 rounded-2xl font-black text-[13px] uppercase tracking-widest text-white transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', boxShadow: '0 4px 24px rgba(99,102,241,0.35)' }}
                >
                  <Globe size={16} /> Assinar por GOV
                </button>

                <button
                  onClick={() => {
                    setShowSignPopup(false);
                    pendingDecPdfs.forEach(p => downloadBlob(p.bytes, p.nome));
                  }}
                  className="w-full py-3 rounded-2xl font-bold text-[12px] text-slate-500 hover:text-slate-300 transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  Baixar sem assinatura
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Popup Unificado — Download Concluído + Assinatura Gov */}
      <AnimatePresence>
        {showDownloadPopup && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-xl">
            <motion.div
              initial={{ y: 60, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 60, opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl"
              style={{ background: 'rgba(18,18,28,0.92)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              {/* Top pill handle (iOS style) */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20"></div>
              </div>

              {/* Header icon */}
              <div className="flex flex-col items-center pt-4 pb-2 px-6">
                <div className="w-16 h-16 rounded-[1.2rem] bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-900/60 mb-4">
                  <FileDown size={30} className="text-white" />
                </div>
                <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-widest mb-1">Processamento Concluído</p>
                <h2 className="text-[22px] font-black text-white text-center leading-tight tracking-tight">
                  PDFs Gerados com Sucesso
                </h2>
              </div>

              {/* File list */}
              <div className="mx-5 my-3 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                {downloadedFiles.map((file, i) => (
                  <div key={file} className={`flex items-center gap-3 px-4 py-3 ${i < downloadedFiles.length - 1 ? 'border-b border-white/5' : ''}`}>
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle size={16} className="text-indigo-400" />
                    </div>
                    <span className="text-[12px] text-slate-300 font-medium truncate">{file}</span>
                  </div>
                ))}
              </div>

              {/* Assinatura notice */}
              <div className="mx-5 mb-3 rounded-2xl px-4 py-3 flex items-start gap-3" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertCircle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-200 leading-relaxed font-medium">
                  Documentos gerados precisam de <strong>assinatura eletrônica</strong> via portal Gov.br antes do envio.
                </p>
              </div>

              {/* CTPS warning — só aparece se houver Nova Contratação */}
              {downloadHasNewHiring && (
                <div className="mx-5 mb-3 rounded-2xl px-4 py-3 flex items-start gap-3" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
                  <UserPlus size={16} className="text-indigo-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-indigo-200 leading-relaxed font-medium">
                    Nova contratação detectada — necessário envio da <strong>Carteira de Trabalho Digital</strong> e <strong>Contrato Interno</strong> do farmacêutico contratado.
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="px-5 pb-6 pt-1 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setShowDownloadPopup(false);
                    window.open("https://www.gov.br/pt-br/servicos/assinatura-eletronica?origem=maisacessado_home", "_blank");
                  }}
                  className="w-full py-3.5 rounded-2xl font-black text-[13px] uppercase tracking-widest text-white transition-all active:scale-[0.97]"
                  style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', boxShadow: '0 4px 24px rgba(99,102,241,0.35)' }}
                >
                  ✦ Abrir Portal Gov.br
                </button>
                <button
                  onClick={() => setShowDownloadPopup(false)}
                  className="w-full py-3.5 rounded-2xl font-bold text-[13px] text-slate-400 hover:text-white transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Background Decorative Blurs */}
      <div className="fixed -top-24 -left-24 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      <div className="fixed -bottom-24 -right-24 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
    </div>
  );

  function renderFarmaSubRow(f: Pharmacist, field: 'entrada' | 'intervalo' | 'retorno' | 'saida', label: string) {
    return (
      <tr key={`${f.id}-${field}`}>
        <td className="ph-title text-left pl-4 text-xs opacity-80">{label} (F{f.id})</td>
        {DAYS.map(d => (
          <td key={d}>
            <input 
              type="time" 
              value={f[field][d]} 
              onChange={e => updateFarmaSchedule(f.id, field, d, e.target.value)}
              className="w-[92%]"
            />
          </td>
        ))}
        <td>
          <button 
            onClick={() => handleCopyFarmaRow(f.id, field, 'seg')}
            className="p-1 px-2 cursor-pointer bg-white/5 rounded-lg hover:bg-white/15 transition-colors"
          >
            <ClipboardCopy size={14} />
          </button>
        </td>
      </tr>
    );
  }
}
