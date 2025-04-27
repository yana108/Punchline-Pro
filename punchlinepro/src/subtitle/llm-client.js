/**
 * LLM Client - Call large language models with custom API key, endpoint and model
 */

// 导入axios，如果在模块环境中
// 如果在浏览器环境中需要通过<script>标签引入
let axios;
if (typeof window !== 'undefined' && window.axios) {
  axios = window.axios;
} else if (typeof require !== 'undefined') {
  try {
    axios = require('axios');
  } catch (e) {
    console.warn('Axios not found, will attempt to use fetch as fallback');
  }
}


class RAG_SYSTEM{
  constructor(api,endpoint,model) {
    this.api=api;
    this.endpoint=endpoint;
    this.model=model;
  }

  async get_embeddings(data){
    //传入[xx,xx,xx]获取他们的embedding
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.api}`
      },
      body: JSON.stringify({
        model: this.model,
        input: data//[]

      })
    });

    return await response.json()
  }

  cosineSimilarity(input, targets) {
    // 验证输入
    if (!input || !targets || targets.length === 0) {
      throw new Error('输入参数不能为空');
    }

    // // if (!input){}检查通过的条件：input 是 null/undefined/空数组/0/""/false

    // 计算输入向量的模,验证是否为长度为0
    const inputNorm = Math.sqrt(input.reduce((sum, val) => sum + val * val, 0));
    if (inputNorm === 0) {
      throw new Error('输入向量不能是全零向量');
    }

    return targets.map(target => {
      // 验证目标向量
      if (target.length !== input.length) {
        throw new Error('目标向量长度与输入向量不一致');
      }

      // 计算点积
      const dotProduct = input.reduce((sum, val, i) => sum + val * target[i], 0);

      // 计算目标向量的模
      const targetNorm = Math.sqrt(target.reduce((sum, val) => sum + val * val, 0));
      if (targetNorm === 0) {
        throw new Error('目标向量不能是全零向量');
      }

      // 计算余弦相似度
      return dotProduct / (inputNorm * targetNorm);
    });
  }

  cosineSimilarityWithTopK(input, targets, k) {
    // 参数校验
    if (!input || !targets || targets.length === 0) {
      throw new Error('输入参数不能为空');
    }
    if (k <= 0 || !Number.isInteger(k)) {
      throw new Error('k 必须是正整数');
    }
    if (k > targets.length) {
      console.warn(`k (${k}) 超过目标向量数量，返回全部 ${targets.length} 个结果`);
      k = targets.length; // 自动修正为最大值
    }

    // 计算输入向量模长
    const inputNorm = Math.sqrt(input.reduce((sum, val) => sum + val * val, 0));
    if (inputNorm === 0) {
      throw new Error('输入向量不能是全零向量');
    }

    // 计算所有目标的余弦相似度（带索引）
    const resultsWithIndex = targets.map((target, index) => {
      if (target.length !== input.length) {
        throw new Error(`目标向量 ${index} 长度与输入向量不一致`);
      }

      const dotProduct = input.reduce((sum, val, i) => sum + val * target[i], 0);
      const targetNorm = Math.sqrt(target.reduce((sum, val) => sum + val * val, 0));
      if (targetNorm === 0) {
        throw new Error(`目标向量 ${index} 不能是全零向量`);
      }

      return {
        index,                // 保留原始索引
        similarity: dotProduct / (inputNorm * targetNorm),
        vector: target       // 可选：保留原始向量
      };
    });

    // 按相似度降序排序
    resultsWithIndex.sort((a, b) => b.similarity - a.similarity);

    // 返回 Top-K 结果（可自定义返回字段）
    return resultsWithIndex.slice(0, k).map(item => ({
      similarity: item.similarity,
      index: item.index,       // 原始 targets 中的位置
      vector: item.vector      // 可选：返回对应的目标向量
    }));
  }

  async loadLocalJSON(url) {//cors problem 需要后端传来
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Failed to load JSON:", error);
      return null;
    }
  }

  async get_final_data(query_data,target_data){
    const query_response=await this.get_embeddings(query_data);
    const query_embedding=query_response.data[0].embedding
    //console.log(query_embedding);
    const target_response=await this.get_embeddings(target_data);
    //console.log(target_response);
    const target_embbeding_raw_list=target_response.data
    //console.log(target_embbeding_raw_list)
    const target_embeddings=target_embbeding_raw_list.map(target =>target.embedding)
    //console.log(target_embeddings.length)
    //console.log(target_embeddings)
    const result=this.cosineSimilarityWithTopK(query_embedding,target_embeddings,3)
    //console.log(result)
    const topK_index=result.map(item=>item.index);
    //console.log(topK_index)
    const topk_result=topK_index.map(index=>target_data[index])
    //console.log(topk_result)


    for (let i = 0; i < result.length; i++) {
      result[i]["value"]=topk_result[i]
    }
    //console.log(result)
    return result

  }
}

class LLMClient {
  constructor(apiKey, endpoint = 'https://api.openai.com/v1/chat/completions', model = 'gpt-3.5-turbo') {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.model = model;
    // 默认超时时间设置为120秒
    this.timeout = 120000;
    // Track if we're using fetch fallback
    this.usingFetch = !axios;
    // 判断API类型
    this.isVolcesAPI = endpoint.includes('volces.com');
    console.log(`使用API端点: ${endpoint}, 模型: ${model}, 是否Volces API: ${this.isVolcesAPI}`);
  }

  /**
   * Change the endpoint URL
   * @param {string} endpoint - New API endpoint URL
   */
  setEndpoint(endpoint) {
    this.endpoint = endpoint;
    this.isVolcesAPI = endpoint.includes('volces.com');
  }

  /**
   * Change the model
   * @param {string} model - Model identifier
   */
  setModel(model) {
    this.model = model;
  }

  /**
   * Set request timeout
   * @param {number} timeout - Timeout in milliseconds
   */
  setTimeout(timeout) {
    this.timeout = timeout;
  }

  /**
   * Make a request to the LLM
   * @param {Array} messages - Array of message objects {role, content}
   * @param {Object} options - Additional options like temperature, max_tokens, etc.
   * @returns {Promise} - Promise with the response
   */
  async chat(messages, options = {}) {
    try {
      // 构建请求数据
      const requestData = {
        model: this.model,
        messages: messages,
        ...options
      };

      console.log('请求数据:', JSON.stringify(requestData, null, 2));

      // 构建请求头
      const headers = {
        'Content-Type': 'application/json'
      };

      // 根据API类型设置不同的授权头
      if (this.isVolcesAPI) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
        console.log('使用Volces API授权头');
      } else {
        // OpenAI风格的API
        headers['Authorization'] = `Bearer ${this.apiKey}`;
        console.log('使用标准OpenAI风格授权头');
      }

      // 使用axios发送请求
      if (axios) {
        console.log('使用axios发送请求到:', this.endpoint);
        const response = await axios({
          method: 'POST',
          url: this.endpoint,
          headers: headers,
          data: requestData,
          timeout: this.timeout
        });

        console.log('收到响应状态码:', response.status);
        return response.data;
      }
      // 回退到fetch API
      else {
        console.log('使用fetch API作为后备方案');

        // Implement timeout for fetch using AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          console.log('发送fetch请求到:', this.endpoint);
          const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestData),
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          console.log('收到fetch响应状态码:', response.status);

          if (!response.ok) {
            let errorData;
            try {
              errorData = await response.json();
            } catch (e) {
              errorData = { message: await response.text() };
            }
            throw new Error(`API Error: ${response.status} - ${JSON.stringify(errorData)}`);
          }

          return await response.json();
        } catch (fetchError) {
          if (fetchError.name === 'AbortError') {
            throw new Error(`Request timeout after ${this.timeout}ms`);
          }
          throw fetchError;
        }
      }
    } catch (error) {
      console.error('LLM request failed:', error);

      // Handle axios specific errors
      if (axios && error.response) {
        // 服务器响应了错误状态码
        throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (axios && error.request) {
        // 请求已发出但没有收到响应
        throw new Error(`No response received: ${error.message}`);
      } else {
        // 请求配置有问题或fetch错误
        throw error;
      }
    }
  }

  /**
   * Simple completion with just a prompt string
   * @param {string} prompt - The prompt text
   * @param {Object} options - Additional options
   * @returns {Promise} - Promise with the response
   */
  async complete(prompt, options = {}) {
    const messages = [{ role: 'user', content: prompt }];
    const response = await this.chat(messages, options);
    return response;
  }
}

const EMBEDDING_URL ="https://api.chatanywhere.tech/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_API_KEY ="sk-XN70bRykkHJUetyK8ftaD0i9wk1w8oybMSabPmYkeYyQXfM7"; // 替换为你的OpenAI API密钥

const CHAT_API_KEY ="15dcc92c-bbd3-4fd3-9034-aee43e301948"//"sk-csexhbuyxitvapuvxggkkkklooxruykiymuxxgzplmemwqec"//"sk-qhajgxpbjuvningebuufrnfqgmbjfnluepgsgonhhoemwdqd"//"sk-XN70bRykkHJUetyK8ftaD0i9wk1w8oybMSabPmYkeYyQXfM7"//"15dcc92c-bbd3-4fd3-9034-aee43e301948"; // 替换为你的OpenAI API密钥
const CHAT_URL ="https://ark.cn-beijing.volces.com/api/v3/chat/completions"//"https://api.siliconflow.cn/v1/chat/completions"//"https://api.chatanywhere.tech/v1/chat/completions" //"https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const CHAT_MODEL="deepseek-v3-250324"//"Qwen/QwQ-32B"//"gpt-3.5-turbo"//"deepseek-v3-241226"



//或许数据一开始存后台或者一开始就是向量表示？？？？？目前实时的

const customClient = new LLMClient(
    CHAT_API_KEY,
    CHAT_URL,
    CHAT_MODEL
);

/*
customClient.chat([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain quantum computing in simple terms.' }
])
    .then(response => {
        console.log(response.choices[0].message.content);
    })
    .catch(error => {
        console.error('Error:', error);
    });

 */

const rag=new RAG_SYSTEM(EMBEDDING_API_KEY,EMBEDDING_URL,EMBEDDING_MODEL)

const raw_data=[
  {
    "domain": "plan",
    "attribute": "travel",
    "description": "plans to travel after graduation, interested in climbing Mount Fuji"
  },
  {
    "domain": "psychological",
    "attribute": "reflection",
    "description": "notices deeper appreciation for movies upon rewatching"
  },
  {
    "domain": "psychological",
    "attribute": "expression",
    "description": "interested in writing movie reviews and sharing opinions"
  },
  {
    "domain": "psychological",
    "attribute": "preference",
    "description": "deeply moved and healed by abstract metaphors in animated films"
  },
  {
    "domain": "interest",
    "attribute": "sports",
    "description": "Has practiced basketball for 2.5 years and is interested in boxing and cycling"
  },
  {
    "domain": "education",
    "attribute": "school",
    "description": "香港理工大学"
  },
  {
    "domain": "education",
    "attribute": "major",
    "description": "生成式AI与人文"
  },
  {
    "domain": "psychological",
    "attribute": "preferences",
    "description": "does not like open-world games due to lack of clear goals/incentives"
  },
  {
    "domain": "psychological",
    "attribute": "status",
    "description": "self-identifies as a novice gamer"
  },
  {
    "domain": "interest",
    "attribute": "hobby",
    "description": "enjoys running in the morning, especially in a misty city atmosphere"
  },
  {
    "domain": "interest",
    "attribute": "activity",
    "description": "wants to watch sunrise but struggles with waking up early"
  },
  {
    "domain": "interest",
    "attribute": "activity",
    "description": "interested in trying rock climbing for sensory and mindfulness benefits"
  },
  {
    "domain": "psychological",
    "attribute": "values",
    "description": "values connection (with body, nature, others, and the world)"
  },
  {
    "domain": "psychological",
    "attribute": "beliefs",
    "description": "views cities as \"steel jungles\" that disconnect people from nature, prefers real forests"
  },
  {
    "domain": "education",
    "attribute": "current_situation",
    "description": "studying in Hong Kong"
  },
  {
    "domain": "psychological",
    "attribute": "needs",
    "description": "seeks ways to relieve stress while studying abroad"
  },
  {
    "domain": "interest",
    "attribute": "hobby",
    "description": "enjoys running in the morning (especially in misty city atmosphere) and is interested in dancing but concerned about coordination"
  },
  {
    "domain": "interest",
    "attribute": "magazines",
    "description": "likes National Geographic magazine"
  },
  {
    "domain": "interest",
    "attribute": "technology",
    "description": "interested in image processing with Python"
  },
  {
    "domain": "psychological",
    "attribute": "emotional_response",
    "description": "pauses viewing when emotions become too intense"
  },
  {
    "domain": "interest",
    "attribute": "movies",
    "description": "Likes sci-fi movies (e.g., The Matrix) and nature-related documentaries; prefers movies over TV shows, finding them more refined"
  }
]
//console.log(raw_data.length)
const target_data=raw_data.map(data=>data.domain+"::"+data.attribute+"::"+data.description);
const query_data=["我练习篮球多久了？"]
//const result=rag.get_embeddings(query_data).then(resolve=>console.log(resolve.data[0].embedding)).catch(console.error);
//rag.get_final_data(query_data,target_data).then(result=>{console.log("-----");console.log(result)})

// Function using RAG system
async function getRAGResponse(query, target_Data) {
  try {


    const ragResults = await rag.get_final_data([query], target_Data);


    //console.log(ragResults.map(item=>({"value":item.value,"similarity":item.similarity})));
    const context = ragResults.reduce((acc, curr) => acc+curr.value+"\n","")
    //console.log(context)

    const messages = [
      { role: 'system', content: 'You are a helpful assistant. Use the provided context to answer questions accurately.' +
            `Context: ${context}\n\n` },
      { role: 'user', content: `Question: ${query}` }
    ];

    // Get response from LLM
    const response = await customClient.chat(messages);
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error in RAG response:', error);
    throw error;
  }
}

// Function using only LLM
async function getDirectResponse(query, promptTemplate = "翻译成中文(弱智吧风格)") {
  try {
    if (!promptTemplate || promptTemplate === undefined) {
      console.log("警告: 检测到空的promptTemplate，使用默认值");
      promptTemplate = "翻译成中文(弱智吧风格)";
    }
    
    console.log(`开始翻译，使用模板: "${promptTemplate}"`);
    
    const messages = [
      { role: 'system', content: '你是专业的翻译官' },
      { role: 'user', content:`请将: ${query}进行翻译,翻译为中文，不要输出其他额外字符和解释 ${promptTemplate}` }
    ];

    console.log("发送LLM请求:", JSON.stringify(messages));
    const response = await customClient.chat(messages);
    console.log("LLM响应:", response.choices[0].message.content);
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error in direct response:', error);
    throw error;
  }
}

// Example usage
async function demonstrateBothApproaches() {
  const query = "我练习篮球多久了？";

  console.log("=== Using RAG System ===");
  try {
    const ragResponse = await getRAGResponse(query, target_data);
    console.log("RAG Response:", ragResponse);
  } catch (error) {
    console.error("RAG Error:", error);
  }

  console.log("\n=== Using Direct LLM ===");
  try {
    const directResponse = await getDirectResponse(query, "翻译成中文(测试风格)");
    console.log("Direct Response:", directResponse);
  } catch (error) {
    console.error("Direct LLM Error:", error);
  }
}

// Run the demonstration
//demonstrateBothApproaches().catch(console.error);




// Export the client class
export { LLMClient, getDirectResponse, getRAGResponse }; 