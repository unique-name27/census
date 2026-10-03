/**
 * Fictional names matched to each site's local naming conventions. Pools are combined at random,
 * so no generated person corresponds to a real one; obvious collisions with well-known public
 * figures were removed from the pools. Names are displayed given name first, as an HRIS would.
 */
import type { Rng } from './prng'

interface Pool {
  given: readonly string[]
  family: readonly string[]
}

/** Comma-separated names in a template string, so the data stays compact and readable. */
const list = (s: string): string[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

const ANGLO: Pool = {
  given: list(`
    James, Michael, David, Daniel, Matthew, Andrew, Ryan, Kevin, Brian, Jason, Eric, Steven, Mark,
    Paul, Adam, Nathan, Tyler, Kyle, Brandon, Justin, Sean, Patrick, Gregory, Timothy, Benjamin,
    Samuel, Jacob, Ethan, Logan, Owen, Emily, Sarah, Jessica, Jennifer, Amanda, Megan, Rachel,
    Lauren, Hannah, Nicole, Stephanie, Rebecca, Katherine, Allison, Natalie, Olivia, Abigail,
    Madison, Erin, Kelly, Heather, Amy, Melissa, Christina, Laura, Grace, Claire, Caroline, Molly,
    Leah
  `),
  family: list(`
    Smith, Johnson, Williams, Brown, Jones, Miller, Davis, Anderson, Thomas, Moore, Martin, Thompson,
    White, Harris, Clark, Lewis, Robinson, Allen, King, Wright, Hill, Green, Adams, Baker, Nelson,
    Carter, Mitchell, Roberts, Turner, Phillips, Campbell, Parker, Evans, Edwards, Collins, Stewart,
    Murphy, Cook, Rogers, Morgan, Cooper, Peterson, Bailey, Reed, Howard, Ward, Brooks, Bennett,
    Gray, Hughes, Price, Sullivan, Russell, Foster, Hayes, Fisher, Ellis, Harrison, Gibson, McDonald,
    Marshall, O'Brien, Gallagher, Doyle
  `),
}

const SOUTH_ASIAN: Pool = {
  given: list(`
    Aarav, Aditya, Akash, Amit, Anand, Ankit, Arjun, Ashwin, Deepak, Gaurav, Harish, Karthik, Kiran,
    Manish, Mohit, Naveen, Nikhil, Pranav, Prashant, Rahul, Rajesh, Rakesh, Ravi, Rohan, Sachin,
    Sandeep, Sanjay, Santosh, Siddharth, Srinivas, Sudhir, Suresh, Varun, Venkat, Vijay, Vikram,
    Vinay, Vivek, Yash, Abhishek, Aishwarya, Ananya, Anjali, Aparna, Bhavana, Deepa, Divya, Gayathri,
    Harini, Ishita, Kavya, Keerthi, Lakshmi, Meera, Neha, Nisha, Pallavi, Pooja, Priya, Radhika,
    Ramya, Sahana, Shreya, Sindhu, Sneha, Swathi, Tanvi, Vaishnavi, Varsha, Yamini
  `),
  family: list(`
    Sharma, Iyer, Reddy, Nair, Rao, Menon, Kulkarni, Patil, Gupta, Krishnan, Subramanian, Venkatesh,
    Joshi, Shetty, Bhat, Hegde, Pillai, Chatterjee, Das, Mehta, Agarwal, Banerjee, Chandra,
    Deshpande, Gowda, Jain, Kumar, Mishra, Mukherjee, Naidu, Prasad, Raghavan, Ramesh, Saxena, Sen,
    Singh, Srinivasan, Sundaram, Thakur, Varma, Verma, Yadav, Acharya, Ganesan, Murthy, Narayanan,
    Parthasarathy, Rajan, Ranganathan, Swaminathan, Kamaraj
  `),
}

const CHINESE: Pool = {
  given: list(`
    Wei, Jing, Hao, Xin, Yan, Lei, Min, Jun, Fang, Tao, Yue, Ming, Qiang, Xiaoyu, Zihan, Yuxuan,
    Haoran, Jiahui, Xinyi, Yiming, Zhiwei, Jianguo, Hong, Ying, Rui, Bo, Kai, Peng, Qian, Shan, Ting,
    Wen, Xue, Yang, Yi, Yu, Zhen, Ziyi, Mengyao, Shuang, Siyu, Tianyu, Wenjie, Xiaoming, Yifan,
    Zhihao, Jiayi, Ruoxi, Chenxi, Junjie
  `),
  family: list(`
    Wang, Li, Zhang, Liu, Chen, Yang, Zhao, Huang, Zhou, Wu, Xu, Sun, Ma, Zhu, Hu, Guo, He, Gao, Lin,
    Luo, Zheng, Liang, Xie, Song, Tang, Han, Feng, Deng, Cao, Zeng, Xiao, Tian, Dong, Pan, Yuan,
    Jiang, Cai, Shen
  `),
}

const TAIWANESE: Pool = {
  given: list(`
    Yu-Ting, Chih-Hao, Wei-Lun, Hsin-Yi, Po-Han, Shu-Fen, Chia-Hui, Tzu-Yu, Kuan-Ting, Yi-Chen,
    Chun-Yu, Pei-Shan, Ming-Che, Ya-Wen, Cheng-Han, Hui-Ling, Tsung-Han, Yu-Hsuan, Chien-Hung,
    Mei-Ling, Jui-Lin, Shih-Chieh, Hsiao-Wen, Chia-Wei, Yung-Chieh, Pei-Yu, Wen-Hsin, Tzu-Hsuan,
    Chih-Wei, I-Ting, Hung-Wei, Szu-Yu, Kai-Wen, Li-Chun, Chang-Ming, Hsuan-Yu, Ching-Yi, Yen-Ting,
    Kuo-Hua, Shao-Wei, Chiao-Yun, Wei-Ting, Pin-Yi, Yao-Tsung, Hsiang-Lin, Fang-Yu, Ting-An,
    Chun-Hsien, Ya-Chu, Po-Wei
  `),
  family: list(`
    Chen, Lin, Huang, Chang, Lee, Wang, Wu, Liu, Tsai, Yang, Hsu, Cheng, Hsieh, Kuo, Hung, Tseng,
    Chiu, Liao, Lai, Chou, Yeh, Chiang, Ho, Lo, Kao, Chien, Peng, Tu, Shih, Chung, Fan
  `),
}

const VIETNAMESE: Pool = {
  given: list(`
    Minh Anh, Thanh Hai, Quoc Bao, Thu Trang, Duc Huy, Ngoc Lan, Hoang Nam, Phuong Linh, Van Long,
    Thi Mai, Gia Huy, Bao Ngoc, Tuan Anh, Khanh Linh, Minh Quan, Thanh Tam, Duc Minh, Thu Ha,
    Quang Vinh, Hong Nhung, Van Thanh, Ngoc Anh, Hai Dang, Mai Phuong, Trung Kien, Lan Huong,
    Huu Phuoc, Kim Ngan, Dinh Khoa, Thanh Thao, Viet Hoang, My Linh, Anh Tuan, Bich Ngoc, Quoc Khanh,
    Thuy Duong, Minh Tri, Hoai An, Tien Dat, Ngoc Han, Cong Danh, Diem Quynh, Phuc Thinh, Tuong Vi,
    Nhat Minh
  `),
  family: list(`
    Nguyen, Tran, Le, Pham, Hoang, Huynh, Phan, Vu, Vo, Dang, Bui, Do, Ho, Ngo, Duong, Ly
  `),
}

const HISPANIC: Pool = {
  given: list(`
    Carlos, Luis, Jorge, Miguel, Alejandro, Diego, Ricardo, Fernando, Andres, Gabriel, Mateo,
    Eduardo, Raul, Sergio, Maria, Ana, Sofia, Isabella, Camila, Valeria, Daniela, Gabriela, Lucia,
    Elena, Carmen, Adriana, Mariana, Paula, Veronica, Ignacio
  `),
  family: list(`
    Garcia, Martinez, Rodriguez, Hernandez, Lopez, Gonzalez, Perez, Sanchez, Ramirez, Torres, Flores,
    Gomez, Diaz, Reyes, Cruz, Morales, Ortiz, Gutierrez, Chavez, Ramos, Ruiz, Alvarez, Mendoza,
    Castillo, Jimenez, Vargas, Romero, Herrera, Medina, Aguilar
  `),
}

const KOREAN: Pool = {
  given: list(`
    Ji-hoon, Min-jun, Seo-yeon, Hyun-woo, Ji-woo, Eun-ji, Dong-hyun, Soo-jin, Jae-won, Ha-eun,
    Sung-min, Yu-na, Joon-ho, Da-eun, Tae-yang, Hye-jin
  `),
  family: list(`
    Kim, Park, Choi, Jung, Kang, Cho, Yoon, Jang, Lim, Shin, Oh
  `),
}

const GERMAN: Pool = {
  given: list(`
    Lukas, Maximilian, Felix, Jonas, Tobias, Florian, Sebastian, Stefan, Matthias, Andreas,
    Christian, Alexander, Johannes, Moritz, Philipp, Julian, Benedikt, Dominik, Markus, Martin, Anna,
    Sophie, Laura, Lea, Katharina, Johanna, Miriam, Lena, Hannah, Sarah, Franziska, Theresa, Carolin,
    Vanessa, Nina, Sabine, Claudia, Kerstin, Melanie, Verena
  `),
  family: list(`
    Müller, Schmidt, Schneider, Fischer, Weber, Meyer, Wagner, Becker, Schulz, Hoffmann, Schäfer,
    Koch, Bauer, Richter, Wolf, Schröder, Neumann, Schwarz, Zimmermann, Braun, Hofmann, Hartmann,
    Lange, Krüger, Werner, Lehmann, Schmitz, Krause, Maier, Huber, Kaiser, Fuchs, Peters, Lang,
    Scholz, Möller, Weiß, Hahn, Vogel, Friedrich, Keller, Berger, Winkler, Roth, Lorenz, Baumann
  `),
}

const ISRAELI: Pool = {
  given: list(`
    Noa, Yael, Omer, Itai, Tamar, Eitan, Maya, Yonatan, Shira, Amit, Roni, Lior, Dana, Gal, Nadav,
    Ariel, Michal, Ido, Avi, Yuval, Ronit, Oren, Hila, Erez, Keren, Guy, Inbal, Assaf, Noam, Shai,
    Efrat, Dror, Liat, Ohad, Neta, Alon, Sigal, Elad, Hadas, Yair, Orly, Boaz, Merav
  `),
  family: list(`
    Cohen, Levi, Mizrahi, Peretz, Biton, Friedman, Avraham, Shapiro, Katz, Ben-David, Azulay, Golan,
    Halevi, Rosen, Segal, Ashkenazi, Dahan, Ofer, Sharabi, Gabay, Amar, Weiss, Goldberg, Ben-Ami,
    Navon, Kaplan, Stern, Lavi, Zohar, Carmel, Paz, Shalev, Dagan, Yosef
  `),
}

const ARAB: Pool = {
  given: list(`
    Rami, Samir, Fadi, Khalil, Nabil, Majd, Tarek, Lina, Rana, Maha, Nour, Reem, Hiba, Yara
  `),
  family: list(`
    Haddad, Khoury, Nassar, Mansour, Awad, Saleh, Bishara, Hanna, Zoabi, Jabareen, Masri, Shehadeh,
    Daher, Kassem
  `),
}

const FRENCH_CANADIAN: Pool = {
  given: list(`
    Mathieu, Étienne, Olivier, Julien, Maxime, Philippe, Alexandre, Guillaume, Chloé, Camille,
    Émilie, Geneviève, Isabelle, Marie-Ève, Sophie, Catherine
  `),
  family: list(`
    Tremblay, Gagnon, Roy, Côté, Bouchard, Gauthier, Morin, Lavoie, Fortin, Gagné, Ouellet,
    Pelletier, Bélanger, Lévesque, Bergeron, Leblanc
  `),
}

const EUROPEAN: Pool = {
  given: list(`
    Marco, Luca, Giulia, Francesca, Piotr, Katarzyna, Tomasz, Agnieszka, Mehmet, Elif, Emre, Zeynep,
    Nikolai, Olga, Dmitri, Irina, Lars, Ingrid, Sven, Astrid
  `),
  family: list(`
    Rossi, Russo, Ferrari, Bianchi, Kowalski, Nowak, Wiśniewski, Lewandowski, Yilmaz, Kaya, Demir,
    Şahin, Ivanov, Petrov, Volkov, Sokolov, Andersson, Johansson, Nielsen, Larsen
  `),
}

const AFRICAN: Pool = {
  given: list(`
    Jamal, Marcus, Andre, Darnell, Malik, Terrence, Xavier, Isaiah, Keisha, Aaliyah, Imani, Jasmine,
    Nia, Tiana, Kwame, Chidi, Amara, Ngozi, Femi, Abena
  `),
  family: list(`
    Washington, Jefferson, Banks, Coleman, Jenkins, Simmons, Okafor, Mensah, Adeyemi, Okonkwo,
    Asante, Boateng, Nwosu, Diallo, Kamara, Owusu, Abiodun, Oduya
  `),
}

const MIDDLE_EASTERN: Pool = {
  given: list(`
    Omar, Ali, Reza, Arash, Darius, Leila, Nadia, Sara, Yasmin, Farah, Kian, Shirin
  `),
  family: list(`
    Hosseini, Karimi, Rahimi, Tehrani, Farahani, Saeed, Rahman, Khan, Hassan, Moradi
  `),
}

type Mix = readonly (readonly [Pool, number])[]

const US_MIX: Mix = [
  [ANGLO, 36],
  [SOUTH_ASIAN, 20],
  [CHINESE, 7],
  [TAIWANESE, 7],
  [KOREAN, 4],
  [VIETNAMESE, 4],
  [HISPANIC, 10],
  [AFRICAN, 5],
  [MIDDLE_EASTERN, 4],
  [EUROPEAN, 3],
]
const CANADA_MIX: Mix = [
  [ANGLO, 30],
  [FRENCH_CANADIAN, 12],
  [SOUTH_ASIAN, 18],
  [CHINESE, 18],
  [KOREAN, 4],
  [VIETNAMESE, 4],
  [MIDDLE_EASTERN, 6],
  [EUROPEAN, 4],
  [AFRICAN, 4],
]
const MIX_BY_SITE: Record<string, Mix> = {
  'San Jose': US_MIX,
  Austin: US_MIX,
  Raleigh: US_MIX,
  Boulder: US_MIX,
  Seattle: US_MIX,
  Toronto: CANADA_MIX,
  Vancouver: CANADA_MIX,
  Munich: [
    [GERMAN, 72],
    [EUROPEAN, 14],
    [SOUTH_ASIAN, 8],
    [CHINESE, 3],
    [MIDDLE_EASTERN, 3],
  ],
  Haifa: [
    [ISRAELI, 82],
    [ARAB, 14],
    [EUROPEAN, 4],
  ],
  Bengaluru: [[SOUTH_ASIAN, 1]],
  Hsinchu: [[TAIWANESE, 1]],
  Shanghai: [[CHINESE, 1]],
  'Ho Chi Minh City': [[VIETNAMESE, 1]],
}

const INITIALS = 'ABCDEFGHJKLMNPRSTVW'

/** Hands out names that are unique within the book. */
export class NameBook {
  private used = new Set<string>()
  constructor(private rng: Rng) {}

  name(location: string): string {
    const mix = MIX_BY_SITE[location] ?? US_MIX
    for (let attempt = 0; attempt < 12; attempt++) {
      const pool = this.rng.pickPair(mix)
      const n = `${this.rng.pick(pool.given)} ${this.rng.pick(pool.family)}`
      if (!this.used.has(n)) {
        this.used.add(n)
        return n
      }
    }
    // Pools are nearly exhausted for this site: fall back to a middle initial.
    for (;;) {
      const pool = this.rng.pickPair(mix)
      const n = `${this.rng.pick(pool.given)} ${this.rng.pick(INITIALS.split(''))}. ${this.rng.pick(pool.family)}`
      if (!this.used.has(n)) {
        this.used.add(n)
        return n
      }
    }
  }
}
