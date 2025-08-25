const bcrypt = require("bcryptjs"); 
const jwt = require("jsonwebtoken"); 
const User = require("../models/User"); 
const agent = require("../models/Agent");
// Function to handle user login
const login = async (req, res) => {
  try {
    let user ;
    const { email, password } = req.body;
    console.log(req.body)
    if(email.endsWith("@agent.com")){
      user = await agent.findOne({ email });
    }else{
      user = await User.findOne({ email });
    }
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" }); 
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid credentials" }); 
    }
    console.log(process.env.JWT_SECRET)
    const token = jwt.sign({email: email }, process.env.JWT_SECRET);
    res.cookie("token", token);
    
    res.json({ token , user});
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Server error" }); 
  }
};

const signup = async (req, res) => {
  try {
    const { name, email, password, confirmPass , fullNumber } = req.body;

      let user; // Use let instead of const because you will reassign it

      if (email.endsWith("@agent.com")) {
        user = await agent.findOne({ email });
      } else {
        user = await User.findOne({ email });
      }
      if (user) {
        return res.status(400).json({ message: "User already exists" });
      }

      if (password !== confirmPass) {
        return res.status(401).json({ message: "Passwords do not match" });
      }

      bcrypt.hash(password, 10, async (err, hash) => {
        if (err) {
          console.error("Hashing Error:", err);
          return res.status(500).json({ message: "Server error" });
        }

        let newUser;
        
        if (email.endsWith("@agent.com")) {
          newUser = await agent.create({
            name,
            email,
            mobile:fullNumber,
            password: hash,
          });
        } else {
          newUser = await User.create({
            name,
            email,
            password: hash,
          });
        }

        res.status(201).json(user);
});  
} catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ message: "Server error" });
  }
}

const logout = (req,res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "Lax",
    secure: false // use true in production (HTTPS)
  });
  res.json({ message: "Logged out successfully" });
} 


module.exports = { login , signup, logout }; // Export the login function for use in routes
