const Usuario = require('../models/Usuario');
const Producto = require('../models/Producto');
const Cliente = require('../models/Cliente');
const Pedido = require('../models/Pedido');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'variables.env' });

const crearToken = (usuario, secreta, expiresIn) => {
    const { id, email, nombre, apellido } = usuario;
    return jwt.sign({ id, email, nombre, apellido }, secreta, { expiresIn });
}

const resolvers = {
    Query: {
        obtenerUsuario: async(_, {}, ctx) => {
            return ctx.usuario;
        },
        obtenerProductos: async() => {
            try {
                const productos = await Producto.find({});
                return productos;
            } catch (error) {
                console.log(error);
            }
        },
        obtenerProducto: async(_, { id }) => {
            const producto = await Producto.findById(id);

            if (!producto) {
                throw new Error('Producto no encontrado');
            }

            return producto;
        },
        obtenerClientes: async() => {
            try {
                const clientes = await Cliente.find({});
                return clientes;
            } catch (error) {
                console.log(error);
            }
        },
        obtenerClientesVendedor: async(_, {}, ctx) => {
            try {
                const clientes = await Cliente.find({ vendedor: ctx.usuario.id.toString() });
                return clientes;
            } catch (error) {
                console.log(error);
            }
        },
        obtenerCliente: async(_, { id }, ctx) => {
            //Revisar si el cliente existe o no 
            const cliente = await Cliente.findById(id);

            if (!cliente) {
                throw new Error('Cliente no encontrado');
            }

            //Quien lo creó puede verlo
            if (cliente.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales');
            }

            return cliente;
        },
        ObtenerPedidos: async() => {
            try {
                const pedidos = await Pedido.find({});
                return pedidos;
            } catch (error) {
                console.log(error);
            }
        },
        ObtenerPedidosVendedor: async(_, {}, ctx) => {
            try {
                const pedidos = await Pedido.find({ vendedor: ctx.usuario.id.toString() }).populate('cliente');
                return pedidos;
            } catch (error) {
                console.log(error);
            }
        },
        ObtenerPedido: async(_, { id }, ctx) => {
            //Revisar si el pedido existe o no 
            const pedido = await Pedido.findById(id);

            if (!pedido) {
                throw new Error('Pedido no encontrado');
            }

            //Quien lo creó puede verlo
            if (pedido.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales');
            }

            return pedido;
        },
        ObtenerPedidosEstado: async({ _, estado }, ctx) => {
            const pedidos = await Pedido.find({ vendedor: ctx.vendedor.id, estado }).limit(10);
            return pedidos;
        },
        mejoresClientes: async() => {
            const clientes = await Pedido.aggregate([
                { $match: { estado: "COMPLETADO" } },
                {
                    $group: {
                        _id: "$cliente",
                        total: { $sum: '$total' }
                    }
                },
                {
                    $lookup: {
                        from: 'clientes',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'cliente'
                    }
                },
                { $limit: 5 },
                { $sort: { total: -1 } }
            ]);
            return clientes;
        },
        mejoresVendedores: async() => {
            const vendedores = await Pedido.aggregate([
                { $match: { estado: "COMPLETADO" } },
                {
                    $group: {
                        _id: "$vendedor",
                        total: { $sum: '$total' }
                    }
                },
                {
                    $lookup: {
                        from: 'usuarios',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'vendedor'
                    }
                },
                { $limit: 5 },
                { $sort: { total: -1 } }
            ]);
            return vendedores;
        },
        buscarProducto: async(_, { texto }) => {
            const productos = await Producto.find({ $text: { $search: texto } });
            return productos;
        }
    },
    Mutation: {
        nuevoUsuario: async(_, { input }) => {
            const { email, password } = input;

            //Revisar si el usuario ya esta registrado
            const existeUsuario = await Usuario.findOne({ email });
            if (existeUsuario) {
                throw new Error('El usuario ya esta registrado');
            }

            //Hashear su password
            const salt = await bcryptjs.genSalt(10);
            input.password = await bcryptjs.hash(password, salt);

            //Guardar en la base de datos
            try {
                const usuario = new Usuario(input);
                usuario.save();
                return usuario;
            } catch {
                console.log(error);
            }
        },
        autenticarUsuario: async(_, { input }) => {
            const { email, password } = input
            //Si el usuario existe
            const existeUsuario = await Usuario.findOne({ email });
            if (!existeUsuario) {
                throw new Error('El usuario no existe');
            }

            //Revisar si el password es correcto
            const passwordCorrecto = await bcryptjs.compare(password, existeUsuario.password);
            if (!passwordCorrecto) {
                throw new Error('El password es incorrecto');
            }

            //Crear el token
            return {
                token: crearToken(existeUsuario, process.env.SECRETA, '24h')
            }
        },
        nuevoProducto: async(_, { input }) => {
            try {
                const producto = new Producto(input);

                //Almacenar en la bd
                const resultado = await producto.save();
                return resultado;
            } catch (error) {
                console.log(error);
            }
        },
        actualizarProducto: async(_, { id, input }) => {
            let producto = await Producto.findById(id);

            if (!producto) {
                throw new Error('Producto no encontrado');
            }

            producto = await Producto.findOneAndUpdate({ _id: id }, input, { new: true });

            return producto;
        },
        eliminarProducto: async(_, { id }) => {
            let producto = await Producto.findById(id);

            if (!producto) {
                throw new Error('Producto no encontrado');
            }

            await Producto.findOneAndDelete({ _id: id });

            return "Producto Eliminado";
        },
        nuevoCliente: async(_, { input }, ctx) => {
            const { email } = input;
            const cliente = await Cliente.findOne({ email });

            if (cliente) {
                throw new Error('Cliente ya registrado');
            }

            const nuevoCliente = new Cliente(input);

            nuevoCliente.vendedor = ctx.usuario.id;

            try {
                const resultado = await nuevoCliente.save();
                return resultado;
            } catch (error) {
                console.log(error);
            }
        },
        actualizarCliente: async(_, { id, input }, ctx) => {
            let cliente = await Cliente.findById(id);

            if (!cliente) {
                throw new Error('Cliente no encontrado');
            }

            if (cliente.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales');
            }

            cliente = await Cliente.findOneAndUpdate({ _id: id }, input, { new: true });

            return cliente;
        },
        eliminarCliente: async(_, { id }, ctx) => {
            let cliente = await Cliente.findById(id);

            if (!cliente) {
                throw new Error('Cliente no encontrado');
            }

            if (cliente.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales');
            }


            await Cliente.findOneAndDelete({ _id: id });

            return "Cliente Eliminado";
        },
        nuevoPedido: async(_, { input }, ctx) => {
            const { cliente } = input;

            //Verificar si el cliente existe
            let clienteExiste = await Cliente.findById(cliente);

            if (!clienteExiste) {
                throw new Error('Cliente no existe');
            }

            //Verificar si el cliente es del vendedor

            if (clienteExiste.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales');
            }


            //Revisar que el stock esté disponible
            for await (const producto of input.pedido) {
                const { id } = producto;

                const productoBD = await Producto.findById(id);

                if (producto.cantidad > productoBD.existencia) {
                    throw new Error(`El producto: ${productoBD.nombre} excede la cantidad disponible`);
                } else {
                    //Actualizar stocks
                    productoBD.existencia = productoBD.existencia - producto.cantidad;

                    await productoBD.save();
                }
            }

            //Crear un nuevo pedido
            const nuevoPedido = new Pedido(input);

            //Asignarle un vendedor
            nuevoPedido.vendedor = ctx.usuario.id;

            //Guardar en bd
            const resultado = await nuevoPedido.save();
            return resultado;
        },
        actualizarPedido: async(_, { id, input }, ctx) => {
            const { cliente } = input;

            const existePedido = await Pedido.findById(id);
            if (!existePedido) {
                throw new Error('El Pedido no existe');
            }

            const existeCliente = await Cliente.findById(cliente);
            if (!existeCliente) {
                throw new Error('El Cliente no existe');
            }

            if (existeCliente.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales');
            }

            //Revisar que el stock esté disponible
            if (input.pedido) {
                for await (const producto of input.pedido) {
                    const { id } = producto;

                    const productoBD = await Producto.findById(id);

                    if (producto.cantidad > productoBD.existencia) {
                        throw new Error(`El producto: ${productoBD.nombre} excede la cantidad disponible`);
                    } else {
                        //Actualizar stocks
                        productoBD.existencia = productoBD.existencia - producto.cantidad;

                        await productoBD.save();
                    }
                }
            }

            const resultado = await Pedido.findOneAndUpdate({ _id: id }, input, { new: true });
            return resultado;
        },
        eliminarPedido: async(_, { id }, ctx) => {
            let pedido = await Pedido.findById(id);

            if (!pedido) {
                throw new Error('Pedido no encontrado');
            }

            if (pedido.vendedor.toString() !== ctx.usuario.id) {
                throw new Error('No tienes las credenciales');
            }


            await Pedido.findOneAndDelete({ _id: id });

            return "Pedido Eliminado";
        }
    }
}

module.exports = resolvers;